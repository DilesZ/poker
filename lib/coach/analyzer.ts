// Agregador del coach: resume historiales del héroe y emite flags solo con muestra suficiente.
// Sin dependencias. Todo en español. TypeScript estricto.
import { REFERENCES } from "./references";
import type { CoachFlag, CoachReport, HandAction, HandRecord, PosLabel } from "./types";

const POSICIONES: PosLabel[] = ["SB", "BB", "UTG", "MP", "CO", "BTN"];
const FUENTE_POR_DEFECTO = "matriz baselines v0 (tag), n=5000, seed 7";

// Acción voluntaria preflop: poner fichas sin estar obligado (c/b/r/a).
function esVoluntariaPreflop(a: HandAction): boolean {
  return a.action === "call" || a.action === "bet" || a.action === "raise" || a.action === "allin";
}

// Acción agresiva preflop: abrir o subir (b/r/a).
function esAgresivaPreflop(a: HandAction): boolean {
  return a.action === "bet" || a.action === "raise" || a.action === "allin";
}

function posicionHeroe(h: HandRecord): PosLabel | undefined {
  return h.positions[h.heroSeat] as PosLabel | undefined;
}

function heroePusoVoluntarioPreflop(h: HandRecord): boolean {
  return h.actions.some(
    (a) => a.street === "preflop" && a.seat === h.heroSeat && esVoluntariaPreflop(a),
  );
}

function heroeAbrioAgresivoPreflop(h: HandRecord): boolean {
  return h.actions.some(
    (a) => a.street === "preflop" && a.seat === h.heroSeat && esAgresivaPreflop(a),
  );
}

// Three-bet del héroe: raise/allin preflop con agresión rival previa (bet/raise/allin).
function heroeHizoThreeBet(h: HandRecord): boolean {
  let huboAgresionRival = false;
  for (const a of h.actions) {
    if (a.street !== "preflop") continue;
    const esHeroe = a.seat === h.heroSeat;
    if (!esHeroe && (a.action === "bet" || a.action === "raise" || a.action === "allin")) {
      huboAgresionRival = true;
      continue;
    }
    if (esHeroe && (a.action === "raise" || a.action === "allin") && huboAgresionRival) {
      return true;
    }
  }
  return false;
}

// La mano llegó a flop: hay alguna acción postflop o hubo showdown.
function llegoAFlop(h: HandRecord): boolean {
  if (h.result.showdown) return true;
  return h.actions.some((a) => a.street !== "preflop");
}

function tieneAccionPostflopHeroe(h: HandRecord): boolean {
  return h.actions.some((a) => a.street !== "preflop" && a.seat === h.heroSeat);
}

function heroeChequeoPostflop(h: HandRecord): boolean {
  return h.actions.some(
    (a) => a.street !== "preflop" && a.seat === h.heroSeat && a.action === "check",
  );
}

// Oportunidad BB-vs-open: héroe en BB y hay bet/raise/allin rival antes de su primera acción preflop.
function esOportunidadBBVsOpen(h: HandRecord): boolean {
  if (posicionHeroe(h) !== "BB") return false;
  let primeraHeroe = -1;
  for (let i = 0; i < h.actions.length; i++) {
    const a = h.actions[i] as HandAction;
    if (a.street === "preflop" && a.seat === h.heroSeat) {
      primeraHeroe = i;
      break;
    }
  }
  if (primeraHeroe < 0) return false;
  for (let i = 0; i < primeraHeroe; i++) {
    const a = h.actions[i] as HandAction;
    if (
      a.street === "preflop" &&
      a.seat !== h.heroSeat &&
      (a.action === "bet" || a.action === "raise" || a.action === "allin")
    ) {
      return true;
    }
  }
  return false;
}

function heroeFoldeoPrimeraPreflop(h: HandRecord): boolean {
  for (const a of h.actions) {
    if (a.street === "preflop" && a.seat === h.heroSeat) {
      return a.action === "fold";
    }
  }
  return false;
}

export function analyzeHistories(hands: HandRecord[]): CoachReport {
  const n = hands.length;

  // --- Overall del héroe ---
  const vpipManos = hands.filter(heroePusoVoluntarioPreflop).length;
  const pfrManos = hands.filter(heroeAbrioAgresivoPreflop).length;
  const threeBetManos = hands.filter(heroeHizoThreeBet).length;
  const showdowns = hands.filter((h) => h.result.showdown).length;
  const manosFlop = hands.filter(llegoAFlop).length;

  // Agresión postflop del héroe: (b+r)/c; si c==0, b+r. Contrato literal (allin no cuenta aquí).
  let apuestasPostflop = 0;
  let callsPostflop = 0;
  for (const h of hands) {
    for (const a of h.actions) {
      if (a.street === "preflop" || a.seat !== h.heroSeat) continue;
      if (a.action === "bet" || a.action === "raise") apuestasPostflop += 1;
      else if (a.action === "call") callsPostflop += 1;
    }
  }
  const aggro = callsPostflop === 0 ? apuestasPostflop : apuestasPostflop / callsPostflop;

  // --- Por posición: solo manos donde el héroe TUVO esa posición ---
  const byPosition = {} as Record<PosLabel, { hands: number; vpip: number; pfr: number }>;
  for (const pos of POSICIONES) {
    const grupo = hands.filter((h) => posicionHeroe(h) === pos);
    const vpip = grupo.filter(heroePusoVoluntarioPreflop).length;
    const pfr = grupo.filter(heroeAbrioAgresivoPreflop).length;
    byPosition[pos] = {
      hands: grupo.length,
      vpip: grupo.length === 0 ? 0 : vpip / grupo.length,
      pfr: grupo.length === 0 ? 0 : pfr / grupo.length,
    };
  }

  const flags: CoachFlag[] = [];

  // --- Flag 1: VPIP alto en EP (UTG+MP agregados) ---
  const refEP = REFERENCES.find((r) => r.metric === "vpip" && r.pos === "EP");
  const altoEP = refEP?.high ?? 0.12;
  const bajoEP = refEP?.low ?? 0.03;
  const fuenteEP = refEP?.source ?? FUENTE_POR_DEFECTO;
  const manosEP = hands.filter((h) => {
    const p = posicionHeroe(h);
    return p === "UTG" || p === "MP";
  });
  if (manosEP.length >= 20) {
    const voluntariasEP = manosEP.filter(heroePusoVoluntarioPreflop);
    const vpipEP = voluntariasEP.length / manosEP.length;
    if (vpipEP > altoEP + 0.1) {
      flags.push({
        id: "VPIP_ALTO_EP",
        kind: "VPIP_ALTO_EP",
        title: "Juegas demasiadas manos fuera de posición",
        detail: `VPIP ${(vpipEP * 100).toFixed(1)}% en EP (UTG+MP) con n=${manosEP.length} manos; referencia ${(bajoEP * 100).toFixed(1)}%–${(altoEP * 100).toFixed(1)}%.`,
        evidenceHandIds: voluntariasEP.slice(0, 5).map((h) => h.id),
        source: fuenteEP,
      });
    }
  }

  // --- Flag 2: pasivo postflop ---
  const refAggro = REFERENCES.find((r) => r.metric === "aggro_postflop");
  const fuenteAggro = refAggro?.source ?? FUENTE_POR_DEFECTO;
  const bajoAggro = refAggro?.low ?? 1.0;
  const altoAggro = refAggro?.high ?? 3.0;
  const manosPostflop = hands.filter(tieneAccionPostflopHeroe);
  if (manosPostflop.length >= 20 && aggro < 0.5) {
    const conCheck = manosPostflop.filter(heroeChequeoPostflop);
    const base = conCheck.length > 0 ? conCheck : manosPostflop;
    flags.push({
      id: "PASIVO_POSTFLOP",
      kind: "PASIVO_POSTFLOP",
      title: "Juegas demasiado pasivo postflop",
      detail: `Agresión postflop ${aggro.toFixed(2)} con n=${manosPostflop.length} manos con acción postflop; referencia ${bajoAggro.toFixed(1)}–${altoAggro.toFixed(1)}.`,
      evidenceHandIds: base.slice(0, 5).map((h) => h.id),
      source: fuenteAggro,
    });
  }

  // --- Flag 3: overfold de BB ante open ---
  const refFold = REFERENCES.find((r) => r.metric === "fold_bb_vs_open");
  const fuenteFold = refFold?.source ?? FUENTE_POR_DEFECTO;
  const bajoFold = refFold?.low ?? 0.55;
  const altoFold = refFold?.high ?? 0.85;
  const oppsBB = hands.filter(esOportunidadBBVsOpen);
  if (oppsBB.length >= 15) {
    const folds = oppsBB.filter(heroeFoldeoPrimeraPreflop).length;
    const tasaFold = folds / oppsBB.length;
    if (tasaFold > altoFold) {
      flags.push({
        id: "OVERFOLD_BB",
        kind: "OVERFOLD_BB",
        title: "Foldeas demasiado en ciega grande",
        detail: `Fold ${(tasaFold * 100).toFixed(1)}% en BB ante open con n=${oppsBB.length} oportunidades; referencia ${(bajoFold * 100).toFixed(1)}%–${(altoFold * 100).toFixed(1)}%.`,
        evidenceHandIds: oppsBB.filter(heroeFoldeoPrimeraPreflop).slice(0, 5).map((h) => h.id),
        source: fuenteFold,
      });
    }
  }

  return {
    sampleN: n,
    overall: {
      vpip: n === 0 ? 0 : vpipManos / n,
      pfr: n === 0 ? 0 : pfrManos / n,
      threeBet: n === 0 ? 0 : threeBetManos / n,
      wtsd: manosFlop === 0 ? 0 : showdowns / manosFlop,
      showdownRate: n === 0 ? 0 : showdowns / n,
      aggro,
    },
    byPosition,
    flags,
  };
}
