// Agregador del coach: resume historiales del héroe y emite flags solo con muestra suficiente.
// Dependencias: referencias + baselines/strength (tiers/categorías) + tipos. Todo en español. TypeScript estricto.
import { madeCategory, preflopTier } from "../baselines/strength";
import type { Card } from "../poker/types";
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

// --- Ayudas F29 (Kinds v2): validación de cartas y agresiones por calle ---

const PALOS_VALIDOS: ReadonlySet<string> = new Set(["♠", "♥", "♦", "♣"]);

function esCartaValida(c: unknown): c is Card {
  if (typeof c !== "object" || c === null) return false;
  const o = c as { rank?: unknown; suit?: unknown };
  return (
    typeof o.rank === "number" &&
    Number.isInteger(o.rank) &&
    o.rank >= 2 &&
    o.rank <= 14 &&
    typeof o.suit === "string" &&
    PALOS_VALIDOS.has(o.suit)
  );
}

// heroHole válido: 2 cartas con rango 2-14 y palo válido. Si no, null (se salta la mano).
function heroHoleValido(h: HandRecord): [Card, Card] | null {
  const hole = h.heroHole;
  if (!Array.isArray(hole) || hole.length !== 2) return null;
  const a = hole[0];
  const b = hole[1];
  if (!esCartaValida(a) || !esCartaValida(b)) return null;
  return [a, b];
}

// Board válido: array de cartas todas válidas. Null si falta o hay alguna inválida.
function boardValido(h: HandRecord): Card[] | null {
  const b = h.board;
  if (!Array.isArray(b)) return null;
  for (const c of b) {
    if (!esCartaValida(c)) return null;
  }
  return b as Card[];
}

  // Agresión del héroe en una calle concreta: bet/raise/allin (allin cuenta).
  function heroeAgredioEn(h: HandRecord, calle: "turn" | "river"): boolean {
    return h.actions.some(
      (a) =>
        a.street === calle &&
        a.seat === h.heroSeat &&
        (a.action === "bet" || a.action === "raise" || a.action === "allin"),
    );
  }

  // Agresión del héroe en turn/river: bet/raise/allin (allin cuenta como agresión).
  // Apuestas postflop del héroe por mano (b+r, mismo cómputo que el aggro global).
function apuestasPostflopPorMano(h: HandRecord): number {
  let n = 0;
  for (const a of h.actions) {
    if (a.street === "preflop" || a.seat !== h.heroSeat) continue;
    if (a.action === "bet" || a.action === "raise") n += 1;
  }
  return n;
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

  // --- Flag 4 (F29): OVERFOLD postflop ante agresión ---
  // Spot = acción postflop del héroe que sea fold o call (aproxima "ante
  // agresión": se excluyen checks; solo folds+calls cuentan como denominator).
  const refOverfold = REFERENCES.find((r) => r.metric === "overfold_postflop");
  const fuenteOverfold = refOverfold?.source ?? FUENTE_POR_DEFECTO;
  let foldsPostflop = 0;
  let callsPostflopFold = 0;
  const idsFoldsPostflop: string[] = [];
  for (const h of hands) {
    let foldEnMano = false;
    for (const a of h.actions) {
      if (a.street === "preflop" || a.seat !== h.heroSeat) continue;
      if (a.action === "fold") {
        foldsPostflop += 1;
        foldEnMano = true;
      } else if (a.action === "call") {
        callsPostflopFold += 1;
      }
    }
    if (foldEnMano) idsFoldsPostflop.push(h.id);
  }
  const denomOverfold = foldsPostflop + callsPostflopFold;
  if (denomOverfold >= 15) {
    const foldRate = foldsPostflop / denomOverfold;
    if (foldRate > 0.75) {
      flags.push({
        id: "OVERFOLD",
        kind: "OVERFOLD",
        title: "Foldeas demasiado postflop ante agresión",
        detail: `Fold ${(foldRate * 100).toFixed(1)}% postflop ante agresión con n=${denomOverfold} spots (${foldsPostflop} folds / ${callsPostflopFold} calls); referencia ≤75.0%.`,
        evidenceHandIds: idsFoldsPostflop.slice(0, 5),
        source: fuenteOverfold,
      });
    }
  }

  // --- Flag 5 (F29): MISSED_VALUE (trío+ sin apuesta en su calle) ---
  // SIN lookahead: la fuerza se evalúa con el board DE ESA CALLE (turn =
  // hole+4, river = hole+5), nunca con el board final para juzgar el turn.
  // Caso = mano con showdown donde el héroe NO agredió ni en turn ni en
  // river y TENÍA trío+ en alguna de esas calles (con su board).
  const refMissed = REFERENCES.find((r) => r.metric === "missed_value");
  const fuenteMissed = refMissed?.source ?? FUENTE_POR_DEFECTO;
  const casosMissed: string[] = [];
  for (const h of hands) {
    if (!h.result.showdown) continue;
    const hole = heroHoleValido(h);
    const mesa = boardValido(h);
    if (hole === null || mesa === null) continue;
    if (heroeAgredioEn(h, "turn") || heroeAgredioEn(h, "river")) continue;
    let maxCategoria = -1;
    if (mesa.length >= 4) {
      try {
        maxCategoria = Math.max(maxCategoria, madeCategory([...hole, ...mesa.slice(0, 4)]));
      } catch {
        /* mano incompleta: se ignora */
      }
    }
    if (mesa.length >= 5) {
      try {
        maxCategoria = Math.max(maxCategoria, madeCategory([...hole, ...mesa.slice(0, 5)]));
      } catch {
        /* mano incompleta: se ignora */
      }
    }
    if (maxCategoria >= 3) casosMissed.push(h.id);
  }
  if (casosMissed.length >= 3) {
    flags.push({
      id: "MISSED_VALUE",
      kind: "MISSED_VALUE",
      title: "Dejas valor sin apostar con manos fuertes",
      detail: `${casosMissed.length} casos con trío+ y showdown sin apuesta en turn ni river; referencia n≥3 casos (categoría ≥3 trío+).`,
      evidenceHandIds: casosMissed.slice(0, 5),
      source: fuenteMissed,
    });
  }

  // --- Flag 6 (F29): BAD_SIZING (apuestas extremas) ---
  const refSizing = REFERENCES.find((r) => r.metric === "bad_sizing");
  const fuenteSizing = refSizing?.source ?? FUENTE_POR_DEFECTO;
  let nApuestas = 0;
  let nExtremas = 0;
  const ejemplosExtremos: Array<{ id: string; sizing: number }> = [];
  for (const h of hands) {
    for (const a of h.actions) {
      if (a.seat !== h.heroSeat) continue;
      if (a.action !== "bet" && a.action !== "raise") continue;
      const sizing = a.amount / Math.max(1, a.potAfter - a.amount);
      nApuestas += 1;
      if (sizing < 0.25 || sizing > 1.5) {
        nExtremas += 1;
        ejemplosExtremos.push({ id: h.id, sizing });
      }
    }
  }
  if (nApuestas >= 15 && nExtremas / nApuestas > 0.4) {
    const pct = ((nExtremas / nApuestas) * 100).toFixed(1);
    const ejemplos = ejemplosExtremos
      .slice(0, 5)
      .map((e) => `${e.id}: ${Math.round(e.sizing * 100)}% bote`)
      .join(", ");
    flags.push({
      id: "BAD_SIZING",
      kind: "BAD_SIZING",
      title: "Tus tamaños de apuesta son extremos",
      detail: `Apuestas extremas (<25% o >150% bote) ${pct}% (${nExtremas}/${nApuestas}) con n=${nApuestas} apuestas; ejemplos ${ejemplos}.`,
      evidenceHandIds: ejemplosExtremos.slice(0, 5).map((e) => e.id),
      source: fuenteSizing,
    });
  }

  // --- Flag 7 (F29): BAD_PREFLOP (VPIP con tier 4-5) ---
  const refPref = REFERENCES.find((r) => r.metric === "bad_preflop");
  const fuentePref = refPref?.source ?? FUENTE_POR_DEFECTO;
  const manosDebiles = hands.filter((h) => {
    const hole = heroHoleValido(h);
    if (hole === null) return false;
    let tier = 0;
    try {
      tier = preflopTier(hole);
    } catch {
      return false;
    }
    return tier >= 4;
  });
  if (manosDebiles.length >= 15) {
    const voluntariasDebiles = manosDebiles.filter(heroePusoVoluntarioPreflop);
    const vpipDebil = voluntariasDebiles.length / manosDebiles.length;
    if (vpipDebil > 0.4) {
      flags.push({
        id: "BAD_PREFLOP",
        kind: "BAD_PREFLOP",
        title: "Juegas demasiadas manos débiles preflop",
        detail: `VPIP ${(vpipDebil * 100).toFixed(1)}% con tier 4-5 con n=${manosDebiles.length} manos débiles; referencia ≤40.0%.`,
        evidenceHandIds: voluntariasDebiles.slice(0, 5).map((h) => h.id),
        source: fuentePref,
      });
    }
  }

  // --- Flag 8 (F29): OVERAGGRESSION (aggro alto que pierde) ---
  const refOveraggro = REFERENCES.find((r) => r.metric === "overaggro");
  const fuenteOveraggro = refOveraggro?.source ?? FUENTE_POR_DEFECTO;
  if (n >= 20 && aggro > 4.0) {
    let bbTotal = 0;
    for (const h of hands) bbTotal += h.result.bbWon;
    if (bbTotal < 0) {
      const ordenadas = [...hands].sort(
        (x, y) => apuestasPostflopPorMano(y) - apuestasPostflopPorMano(x),
      );
      const conApuestas = ordenadas.filter((h) => apuestasPostflopPorMano(h) > 0);
      const base = conApuestas.length > 0 ? conApuestas : ordenadas;
      const top = base.slice(0, 5);
      flags.push({
        id: "OVERAGGRESSION",
        kind: "OVERAGGRESSION",
        title: "Tu agresión no está pagando",
        detail: `tu agresión no está pagando: ${bbTotal.toFixed(1)} BB perdidos en ${n} manos con agresión postflop ${aggro.toFixed(2)}; referencia 1.0–3.0.`,
        evidenceHandIds: top.map((h) => h.id),
        source: fuenteOveraggro,
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
