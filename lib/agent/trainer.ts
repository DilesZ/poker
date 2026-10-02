// Entrenador servidor: convierte self-play headless en HandRecords del agente.
// Puro, sin Next/KV. No usa Math.random global directamente: runSelfPlay parchea
// y restaura Math.random internamente; aquí solo se usan seeds locales y
// dreamConsolidate con mulberry32. No muta el brain de entrada.
import { reflectOnHand, type Brain, type HandRecord } from "./brain";
import { dreamConsolidate } from "./dream";
import { buildHandRecord } from "./reflection";
import { DEFAULT_STRATEGY, runSelfPlay } from "../training/selfplay";
import { cloneStrategy } from "../training/strategy";
import type { Experience } from "../training/experience";

export interface TrainOpts {
  hands?: number;
  seed?: number;
  /** Reservado: selfplay fija el héroe en el asiento 0; se acepta por compat. */
  heroSeat?: number;
}

export interface TrainStats {
  hands: number;
  winrateBB100: number;
  showdownPct: number;
  priorsMovidos: number;
}

export interface TrainResult {
  brain: Brain;
  stats: TrainStats;
}

const CALLES = ["preflop", "flop", "turn", "river"] as const;
const CARTAS_FIJAS = "A♠ K♠";
const BOARDS: Record<string, string> = {
  preflop: "",
  flop: "K♦ 7♣ 2♠",
  turn: "K♦ 7♣ 2♠ 5♥",
  river: "K♦ 7♣ 2♠ 5♥ 9♦",
};

type TipoMano = "fold" | "check" | "call" | "raise" | "allin";

/** Mapea heroLastAction de selfplay a tipo de HandRecord. bet→raise, all-in→allin. */
export function mapearAccionSelfPlay(a: string): TipoMano {
  const t = (a ?? "").trim().toLowerCase();
  if (t === "bet") return "raise";
  if (t === "all-in" || t === "allin") return "allin";
  if (t === "fold" || t === "check" || t === "call" || t === "raise") return t;
  return "check";
}

/**
 * Convierte una Experience de selfplay en HandRecord del agente.
 * - won = rewardBB > 0
 * - street: rotación determinista preflop/flop/turn/river por índice (cubre las 4
 *   calles; Experience no trae calle).
 * - myCards/board en formato corto (board acorde a la calle).
 * - stackDelta = round(rewardBB*20), potWon = won ? stackDelta+60 : 0.
 * - numRivales = 5 (6-max).
 */
export function manoAHandRecord(
  exp: Experience,
  handIndex?: number,
  showdown = false,
): HandRecord {
  let idx = handIndex;
  if (idx === undefined) {
    const partes = String(exp.handId ?? "").split(":");
    const h = Number.parseInt(partes[1] ?? "", 10);
    idx = Number.isFinite(h) ? h : 0;
  }
  const calle = CALLES[(((idx % 4) + 4) % 4)] ?? "preflop";
  const tipo = mapearAccionSelfPlay(exp.action);
  const rewardBB = Number.isFinite(exp.rewardBB) ? exp.rewardBB : 0;
  const stackDelta = Math.round(rewardBB * 20);
  const won = rewardBB > 0;
  const potWon = won ? Math.max(20, stackDelta + 60) : 0;
  const amount =
    tipo === "call" || tipo === "raise" || tipo === "allin"
      ? Math.max(10, Math.min(200, Math.round(Math.abs(stackDelta) / 2 + 20)))
      : undefined;
  return buildHandRecord({
    won,
    myCards: CARTAS_FIJAS,
    board: BOARDS[calle] ?? "",
    street: calle,
    actions: [
      {
        street: calle,
        type: tipo,
        ...(amount !== undefined ? { amount } : {}),
      },
    ],
    showdown,
    potWon,
    stackDelta,
    numRivales: 5,
  });
}

function clonarBrain(b: Brain): Brain {
  return {
    handsPlayed: b.handsPlayed,
    lessons: [...b.lessons],
    priors: { ...b.priors },
    beliefs: [...b.beliefs],
    epsilon: b.epsilon,
    ...(b.counts ? { counts: { ...b.counts } } : { counts: {} }),
  };
}

function contarMovidos(priors: Record<string, number>): number {
  let n = 0;
  for (const v of Object.values(priors)) if (v !== 0.5) n++;
  return n;
}

/**
 * Entrena el brain con `hands` manos de selfplay headless.
 * Por cada experiencia del héroe construye un HandRecord y aplica reflectOnHand;
 * cada 10 manos aplica dreamConsolidate(brain, rec, 20) con seed derivada.
 * 1000 manos <8s (selfplay ~4s + ~1000 reflects + 100 sueños x20).
 */
export async function trainBatch(brain: Brain, opts: TrainOpts = {}): Promise<TrainResult> {
  const hands = opts.hands ?? 1000;
  const seed = opts.seed ?? 12345;
  void opts.heroSeat;
  if (!Number.isInteger(hands) || hands <= 0) {
    const clon = clonarBrain(brain);
    return {
      brain: clon,
      stats: { hands: 0, winrateBB100: 0, showdownPct: 0, priorsMovidos: contarMovidos(clon.priors) },
    };
  }
  const strat = cloneStrategy(DEFAULT_STRATEGY);
  const res = runSelfPlay(hands, seed, strat);
  let actual = clonarBrain(brain);
  for (let i = 0; i < res.experiences.length; i++) {
    const exp = res.experiences[i];
    if (!exp) continue;
    const rec = manoAHandRecord(exp, i, false);
    const r = reflectOnHand(actual, rec);
    actual = r.brain;
    if ((i + 1) % 10 === 0) {
      try {
        actual = dreamConsolidate(actual, rec, 20, (seed ^ (i + 1)) >>> 0);
      } catch {
        // best-effort: el sueño nunca rompe el entrenamiento real
      }
    }
  }
  return {
    brain: actual,
    stats: {
      hands: res.hands,
      winrateBB100: res.winrateBB100,
      showdownPct: res.showdownPct,
      priorsMovidos: contarMovidos(actual.priors),
    },
  };
}
