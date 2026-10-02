// Motor de evaluación heads-up: duelos reproducibles entre agentes baseline.
// Juega `hands` manos con botón y asientos alternos (duplicado) sobre
// `lib/engine`. Determinista dado `seed`: sin `Math.random` en ningún punto.
// Cero dependencias salvo el motor y el tipo de agente.
import type { EngineAction, PokerState } from "@/lib/engine/types";
import type { BaselineAgent } from "@/lib/baselines/agent";
import { applyAction } from "@/lib/engine/betting";
import { getInformationSet } from "@/lib/engine/infoset";
import { createRng } from "@/lib/engine/rng";
import { newEngineHand, postBlindsAndDeal } from "@/lib/engine/state";
import {
  advanceStreet,
  awardUncontested,
  settleShowdown,
  verifyConservation,
} from "@/lib/engine/settle";

/** Configuración del duelo (lo consume `scripts/evaluate.ts`). */
export interface MatchConfig {
  hands: number;
  seed: number;
  startingStack?: number;
  sb?: number;
  bb?: number;
}

/** Estadísticas de un agente en el duelo (lo consume `scripts/evaluate.ts`). */
export interface AgentStats {
  hands: number;
  vpip: number;
  pfr: number;
  threeBet: number;
  wtsd: number;
  wsd: number;
  aggro: number;
  showdownRate: number;
  actions: { fold: number; check: number; call: number; bet: number; raise: number; allin: number };
}

/** Resultado del duelo (lo consume `scripts/evaluate.ts`). */
export interface MatchResult {
  hands: number;
  seed: number;
  bb100A: number;
  sdPorManoBB: number;
  ci95: [number, number];
  statsA: AgentStats;
  statsB: AgentStats;
}

// ---------------------------------------------------------------------------
// Constantes e interruptores internos
// ---------------------------------------------------------------------------

/** Valores por defecto: 100bb con ciegas 5/10. */
const PILA_POR_DEFECTO = 1000;
const SB_POR_DEFECTO = 5;
const BB_POR_DEFECTO = 10;

/** Cada cuántas manos se verifica conservación en producción (barato). */
const MANOS_POR_VERIFICACION = 500;

/** Cota de pasos por mano para detectar bucles de un agente defectuoso. */
const MAX_PASOS_POR_MANO = 10000;

/**
 * Flag interno (no es parte del contrato): si es true, verifica conservación
 * al final de CADA mano. Lo activan los tests; en producción sigue cada 500.
 */
export const _matchInterno: { verificarCadaMano: boolean } = { verificarCadaMano: false };

// ---------------------------------------------------------------------------
// Duplicado: botón y asientos alternos
// ---------------------------------------------------------------------------

/**
 * Reparto de asientos de la mano `i` (duplicado estándar).
 * - Asientos FIJOS: A en seat 0, B en seat 1 (si no, un bando sería
 *   siempre SB en HU y el otro casi nunca actuaría).
 * - El botón alterna: button = i % 2 (A es SB en pares, BB en impares).
 */
export function asientosDeLaMano(mano: number): {
  asientoA: number;
  asientoB: number;
  button: number;
} {
  const button = ((mano % 2) + 2) % 2;
  return { asientoA: 0, asientoB: 1, button };
}

// ---------------------------------------------------------------------------
// Registro por mano (materia prima de métricas y stats)
// ---------------------------------------------------------------------------

/** Paso del trazado: token de historial y quién lo puso (-1 = marcador "/calle"). */
interface PasoTrazado {
  seat: number;
  token: string;
}

/** Lo guardado por mano: BB de A, si hubo showdown y trazado con asientos. */
interface RegistroMano {
  asientoA: number;
  asientoB: number;
  bbA: number;
  showdown: boolean;
  ganadores: number[];
  trazado: PasoTrazado[];
}

// ---------------------------------------------------------------------------
// Duelo
// ---------------------------------------------------------------------------

/**
 * Juega un duelo heads-up entre `agentA` y `agentB`.
 * Por mano i: rngHand = createRng(seed*1e6+i), button = i%2, asientos
 * duplicados; mano fresca (newEngineHand + postBlindsAndDeal) y bucle:
 * actingSeat null → 1 vivo? awardUncontested : showdown? settleShowdown :
 * advanceStreet; si no, decide el agente del seat vía getInformationSet.
 */
export function playMatch(
  agentA: BaselineAgent,
  agentB: BaselineAgent,
  cfg: MatchConfig,
): MatchResult {
  const manos = cfg.hands;
  if (!Number.isInteger(manos) || manos < 0) {
    throw new Error(`MatchConfig.hands debe ser entero >= 0 (recibido: ${String(manos)}).`);
  }
  if (!agentA || !agentB) throw new Error("playMatch necesita dos agentes (A y B).");
  const pilaInicial = cfg.startingStack ?? PILA_POR_DEFECTO;
  const sb = cfg.sb ?? SB_POR_DEFECTO;
  const bb = cfg.bb ?? BB_POR_DEFECTO;
  if (!(pilaInicial > 0)) {
    throw new Error(`startingStack debe ser > 0 (recibido: ${String(pilaInicial)}).`);
  }
  if (!(sb > 0) || !(bb > 0)) {
    throw new Error(`sb/bb deben ser > 0 (recibidos: ${String(sb)}/${String(bb)}).`);
  }
  const totalInicial = 2 * pilaInicial;

  const registros: RegistroMano[] = [];
  const bbGanadasA: number[] = [];

  for (let i = 0; i < manos; i++) {
    const semillaMano = cfg.seed * 1_000_000 + i;
    const rngMano = createRng(semillaMano);
    const { asientoA, asientoB, button } = asientosDeLaMano(i);
    let estado: PokerState = postBlindsAndDeal(
      newEngineHand({
        numPlayers: 2,
        startingStack: pilaInicial,
        sb,
        bb,
        button,
        handId: `match-${cfg.seed}-mano-${i}`,
        seed: semillaMano,
      }),
    );
    const trazado: PasoTrazado[] = [];
    let fueShowdown = false;
    let pasos = 0;
    // Bucle de la mano (misma estructura que el canónico de settle.test.ts):
    // con la ronda cerrada se liquida o se avanza de calle; si no, el agente
    // del seat decide desde su infoset y se aplica la acción.
    while (estado.street !== "done") {
      if (++pasos > MAX_PASOS_POR_MANO) {
        throw new Error(`Mano ${i}: demasiados pasos (posible bucle del agente).`);
      }
      if (estado.actingSeat === null || estado.actingSeat === undefined) {
        const vivos = estado.players.filter((p) => !p.folded);
        if (vivos.length <= 1) {
          estado = awardUncontested(estado);
        } else if (estado.street === "showdown") {
          estado = settleShowdown(estado);
          fueShowdown = true;
        } else {
          const nAntes = (estado.history ?? []).length;
          estado = advanceStreet(estado, rngMano);
          const historial = estado.history ?? [];
          for (let k = nAntes; k < historial.length; k++) {
            trazado.push({ seat: -1, token: historial[k] });
          }
        }
      } else {
        const seat: number = estado.actingSeat;
        const agente = seat === asientoA ? agentA : agentB;
        const accion: EngineAction = agente.decide(getInformationSet(estado, seat), rngMano);
        const nAntes = (estado.history ?? []).length;
        estado = applyAction(estado, seat, accion);
        const historial = estado.history ?? [];
        for (let k = nAntes; k < historial.length; k++) {
          trazado.push({ seat, token: historial[k] });
        }
      }
    }
    // Conservación: barata (suma sobre 2 jugadores); cada 500 manos en
    // producción y en cada mano cuando los tests activan el flag interno.
    if (_matchInterno.verificarCadaMano || (i + 1) % MANOS_POR_VERIFICACION === 0) {
      verifyConservation(estado, totalInicial);
    }
    const pilaA = estado.players.find((p) => p.seat === asientoA)?.stack;
    if (pilaA === undefined) throw new Error(`Mano ${i}: sin jugador en asiento ${asientoA}.`);
    const bbA = (pilaA - pilaInicial) / bb;
    bbGanadasA.push(bbA);
    registros.push({
      asientoA,
      asientoB,
      bbA,
      showdown: fueShowdown,
      ganadores: [...(estado.winners ?? [])],
      trazado,
    });
  }

  // Métricas de A en BB/100 con IC95% (±1.96·sd/√n en bb/100).
  let bb100A = 0;
  let sdPorManoBB = 0;
  let ci95: [number, number] = [0, 0];
  if (manos > 0) {
    const media = bbGanadasA.reduce((acc, x) => acc + x, 0) / manos;
    bb100A = media * 100;
    if (manos >= 2) {
      let sumaCuad = 0;
      for (const x of bbGanadasA) sumaCuad += (x - media) * (x - media);
      sdPorManoBB = Math.sqrt(sumaCuad / (manos - 1));
      const semi = (1.96 * sdPorManoBB * 100) / Math.sqrt(manos);
      ci95 = [bb100A - semi, bb100A + semi];
    }
  }

  return {
    hands: manos,
    seed: cfg.seed,
    bb100A,
    sdPorManoBB,
    ci95,
    statsA: construirStats(registros, "A", manos),
    statsB: construirStats(registros, "B", manos),
  };
}

// ---------------------------------------------------------------------------
// Stats desde el historial (las ciegas no están en history: todo c/b/r/a
// preflop es voluntario)
// ---------------------------------------------------------------------------

/** Segmento preflop del trazado: pasos hasta el primer marcador "/calle". */
function segmentoPreflop(trazado: PasoTrazado[]): PasoTrazado[] {
  const corte = trazado.findIndex((p) => p.token.startsWith("/"));
  return corte === -1 ? trazado : trazado.slice(0, corte);
}

/**
 * Agrega las stats de un bando ("A" o "B") desde los registros.
 * - vpip: manos con ≥1 token c/b/r/a preflop del héroe.
 * - pfr: manos con b/r/a preflop del héroe.
 * - threeBet: manos donde el héroe sube (r) habiendo ya una r previa.
 * - wtsd/showdownRate: showdowns vistos / manos (en HU coinciden).
 * - wsd: showdowns ganados (héroe en winners) / vistos.
 * - aggro: (b+r postflop) / (c postflop); si c==0, b+r.
 * - actions: conteo global por tipo de cada token del héroe.
 */
function construirStats(registros: RegistroMano[], quien: "A" | "B", manos: number): AgentStats {
  let manosVpip = 0;
  let manosPfr = 0;
  let manosThreeBet = 0;
  let vistos = 0;
  let ganados = 0;
  let manosShowdown = 0;
  let numAgro = 0;
  let denAgro = 0;
  const acciones = { fold: 0, check: 0, call: 0, bet: 0, raise: 0, allin: 0 };

  for (const reg of registros) {
    const heroe = quien === "A" ? reg.asientoA : reg.asientoB;
    const preflop = segmentoPreflop(reg.trazado);
    const preHeroe = preflop.filter((p) => p.seat === heroe).map((p) => p.token);
    if (preHeroe.some((t) => t[0] === "c" || t[0] === "b" || t[0] === "r" || t[0] === "a")) {
      manosVpip++;
    }
    if (preHeroe.some((t) => t[0] === "b" || t[0] === "r" || t[0] === "a")) {
      manosPfr++;
    }
    let vistoR = false;
    let esThreeBet = false;
    for (const p of preflop) {
      const esR = p.token[0] === "r";
      if (esR && p.seat === heroe && vistoR) esThreeBet = true;
      if (esR) vistoR = true;
    }
    if (esThreeBet) manosThreeBet++;

    if (reg.showdown) {
      manosShowdown++;
      vistos++;
      if (reg.ganadores.includes(heroe)) ganados++;
    }

    for (const p of reg.trazado) {
      if (p.seat !== heroe || p.token.startsWith("/")) continue;
      const c = p.token[0];
      if (c === "f") acciones.fold++;
      else if (c === "x") acciones.check++;
      else if (c === "c") acciones.call++;
      else if (c === "b") acciones.bet++;
      else if (c === "r") acciones.raise++;
      else if (c === "a") acciones.allin++;
    }
    const corte = reg.trazado.findIndex((p) => p.token.startsWith("/"));
    const postHeroe =
      corte === -1
        ? []
        : reg.trazado.slice(corte).filter((p) => p.seat === heroe && !p.token.startsWith("/"));
    for (const p of postHeroe) {
      const c = p.token[0];
      if (c === "b" || c === "r") numAgro++;
      else if (c === "c") denAgro++;
    }
  }

  return {
    hands: manos,
    vpip: manos > 0 ? manosVpip / manos : 0,
    pfr: manos > 0 ? manosPfr / manos : 0,
    threeBet: manos > 0 ? manosThreeBet / manos : 0,
    wtsd: manos > 0 ? vistos / manos : 0,
    wsd: vistos > 0 ? ganados / vistos : 0,
    aggro: denAgro > 0 ? numAgro / denAgro : numAgro,
    showdownRate: manos > 0 ? manosShowdown / manos : 0,
    actions: acciones,
  };
}
