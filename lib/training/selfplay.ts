// Self-play headless determinista para training v0.2. Sin React, sin DOM.
// Usa newHand(6,1000,10/20)+postBlinds+deal, getAiAction con umbrales de strategy,
// advanceStreet hasta showdown, reward en bb y update de pesos por regret simple.

import { advanceStreet, deal, newHand, postBlinds, refreshPot, showdown } from "../poker/game";
import { getAiAction } from "../poker/ai";
import type { AiAction } from "../poker/ai";
import { evaluate7 } from "../poker/evaluator";
import type { Card } from "../poker/types";
import { DEFAULT_STRATEGY, TABLE_POSITIONS, cloneStrategy } from "./strategy";
import type { StrategyVersion, TablePosition } from "./strategy";
import type { Experience } from "./experience";

/** Learning rate del regret simple. */
export const SELFPLAY_LR = 0.05;

// Re-exporta el store de estrategia para el panel (única fuente en strategy.ts).
export { DEFAULT_STRATEGY } from "./strategy";
export { loadStrategy } from "./strategy";
export { saveStrategy } from "./strategy";
export type { StrategyVersion };

/**
 * Alias del panel entrenar: la misma estrategia versionada.
 * El panel la usa como { version, tightness, aggression }.
 */
export type StrategyParams = StrategyVersion;

export interface SelfPlayResult {
  hands: number;
  /** Beneficio medio del héroe (id 0) en bb/100 manos. */
  winrateBB100: number;
  /** Alias camel (panel entrenar). Mismo valor que winrateBB100. */
  winrateBb100: number;
  /** Recompensa media en bb por posición del héroe (0 si sin muestras). */
  byPosition: Record<TablePosition, number>;
  /** Fracción 0-1 de manos que llegan a showdown. */
  showdownPct: number;
  /** Buffer de esta corrida (una experiencia por mano). */
  experiences: Experience[];
  /** Estrategia clonada con rangeWeights actualizados (input no mutado). */
  updatedStrategy: StrategyVersion;
}

/** Stats agregadas del panel entrenar (misma forma que SelfPlayResult). */
export type SelfPlayStats = SelfPlayResult;

/** Stats vacías (lazy initializer válido para useState). */
export function emptyStats(): SelfPlayStats {
  const base = cloneStrategy(DEFAULT_STRATEGY);
  return {
    hands: 0,
    winrateBB100: 0,
    winrateBb100: 0,
    byPosition: zeroByPosition(),
    showdownPct: 0,
    experiences: [],
    updatedStrategy: base,
  };
}

/** Combina dos tandas ponderando por manos (para chunks del panel). */
export function mergeSelfPlay(a: SelfPlayStats, b: SelfPlayStats): SelfPlayStats {
  const hands = (a.hands | 0) + (b.hands | 0);
  if (hands <= 0) return emptyStats();
  const wA = (a.hands | 0) / hands;
  const wB = (b.hands | 0) / hands;
  const byPosition = zeroByPosition();
  for (const pos of TABLE_POSITIONS) {
    byPosition[pos] = (a.byPosition[pos] ?? 0) * wA + (b.byPosition[pos] ?? 0) * wB;
  }
  const winrateBB100 = (a.winrateBB100 ?? 0) * wA + (b.winrateBB100 ?? 0) * wB;
  return {
    hands,
    winrateBB100,
    winrateBb100: winrateBB100,
    byPosition,
    showdownPct: (a.showdownPct ?? 0) * wA + (b.showdownPct ?? 0) * wB,
    experiences: [...a.experiences, ...b.experiences],
    updatedStrategy: b.updatedStrategy ?? a.updatedStrategy,
  };
}

/**
 * Ajuste grueso (±0.02) de tightness/aggression según lo observado.
 * Con la misma estrategia en los 6 asientos el winrate esperado es ≈0;
 * desviaciones pequeñas son varianza, no edge.
 */
export function deriveStrategy(prev: StrategyParams, stats: SelfPlayStats): StrategyParams {
  const next = cloneStrategy(prev);
  next.version = ((prev.version | 0) || 0) + 1;
  const wr = stats.winrateBb100 ?? stats.winrateBB100 ?? 0;
  const sd = stats.showdownPct ?? 0; // fracción 0-1
  let dt = 0;
  let da = 0;
  if (wr > 2) da += 0.02;
  else if (wr < -2) da -= 0.02;
  if (sd > 0.35) dt += 0.02;
  else if (sd < 0.2 && stats.hands > 0) dt -= 0.02;
  next.tightness = clip01((prev.tightness ?? 0.5) + dt);
  next.aggression = clip01((prev.aggression ?? 0.5) + da);
  return next;
}

/** RNG seeded (mulberry32). Determinista por seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Posición 6-max del asiento respecto al botón.
 * rel 0=BTN, 1=SB, 2=BB, 3=EP, 4=MP, 5=CO.
 */
export function positionOfSeat(seat: number, button: number, numPlayers = 6): TablePosition {
  const n = numPlayers > 0 ? Math.floor(numPlayers) : 6;
  const rel = (((seat - button) % n) + n) % n;
  if (n === 6) {
    const map: readonly TablePosition[] = ["BTN", "SB", "BB", "EP", "MP", "CO"];
    return map[rel] as TablePosition;
  }
  if (rel === 0) return "BTN";
  if (rel === 1) return "SB";
  if (rel === 2) return "BB";
  if (rel === n - 1) return "CO";
  if (rel === 3) return "EP";
  return "MP";
}

function clip01(x: number): number {
  if (!Number.isFinite(x)) return 0.5;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function clamp(x: number, lo: number, hi: number): number {
  if (x < lo) return lo;
  if (x > hi) return hi;
  return x;
}

/**
 * Índice de clase 0-168 para rangeWeights.
 * 0-12 parejas (AA=0 … 22=12), 13-90 suited, 91-168 offsuit.
 */
export function handClassIndex(hole: Card[]): number {
  if (hole.length < 2 || !hole[0] || !hole[1]) return 84;
  const a = hole[0] as Card;
  const b = hole[1] as Card;
  const hi = Math.max(a.rank, b.rank);
  const lo = Math.min(a.rank, b.rank);
  if (hi === lo) return 12 - (hi - 2);
  const suited = a.suit === b.suit;
  let p = 0;
  for (let h = 14; h >= 3; h--) {
    for (let l = h - 1; l >= 2; l--) {
      if (h === hi && l === lo) {
        return (suited ? 13 : 13 + 78) + p;
      }
      p++;
    }
  }
  return 84;
}

/** Fuerza 0-1: heurística preflop + categoría del evaluator postflop. */
export function estimateStrength(hole: Card[], board: Card[]): number {
  if (hole.length < 2) return 0.5;
  if (board.length === 0) {
    const hi = Math.max(hole[0]?.rank ?? 2, hole[1]?.rank ?? 2);
    const lo = Math.min(hole[0]?.rank ?? 2, hole[1]?.rank ?? 2);
    if (hi === lo) return clip01(0.55 + ((hi - 2) / 12) * 0.4);
    const suited = hole[0]?.suit === hole[1]?.suit;
    const gap = hi - lo;
    let base = ((hi - 2) / 12) * 0.5 + ((lo - 2) / 12) * 0.15 + 0.15;
    if (suited) base += 0.08;
    if (gap === 1) base += 0.04;
    else if (gap === 2) base += 0.02;
    else if (gap >= 5) base -= 0.08;
    if (hi === 14) base += 0.06;
    return clip01(base);
  }
  const total = [...hole, ...board];
  if (total.length < 5) return 0.5;
  const r = evaluate7(total);
  const top = r.tiebreak[0] ?? 2;
  return clip01(0.12 + (r.category / 8) * 0.78 + ((top - 2) / 12) * 0.1);
}

/** Elige fracción de bote según sizingWeights (usa Math.random → seeded en runSelfPlay). */
function pickSizingFraction(strategy: StrategyVersion): number {
  const w33 = Math.max(0, strategy.sizingWeights["33"] ?? 0);
  const w50 = Math.max(0, strategy.sizingWeights["50"] ?? 0);
  const w75 = Math.max(0, strategy.sizingWeights["75"] ?? 0);
  const sum = w33 + w50 + w75;
  if (!(sum > 0)) return 0.5;
  const r = Math.random() * sum;
  if (r < w33) return 0.33;
  if (r < w33 + w50) return 0.5;
  return 0.75;
}

/**
 * Decisión con estrategia. Rama short-stack (<10bb) 100% determinista y
 * gobernada por strategy.pushFoldThresholds[position]:
 * - gratis (toCall<=0): strength > umbral → all-in, si no check.
 * - con apuesta: strength > umbral o precio ≤10% stack → all-in, si no fold.
 * Con stack profundo delega en getAiAction y aplica sizingWeights al bet.
 */
export function decideWithStrategy(
  strength: number,
  toCall: number,
  pot: number,
  stack: number,
  bb: number,
  position: TablePosition,
  strategy: StrategyVersion,
): AiAction {
  const s = clip01(strength);
  const call = Math.max(0, Math.floor(toCall));
  const threshold = clip01(strategy.pushFoldThresholds[position] ?? 0.55);

  if (stack < 10 * bb) {
    if (call <= 0) return s > threshold ? { action: "all-in", amount: stack } : { action: "check" };
    if (s > threshold || call <= stack * 0.1) return { action: "all-in", amount: stack };
    return { action: "fold" };
  }

  const base = getAiAction(s, call, pot, stack, bb);
  if (base.action === "bet") {
    const room = Math.max(0, stack - call);
    if (room <= 0) return { action: "all-in", amount: stack };
    const frac = pickSizingFraction(strategy);
    const amount = Math.min(room, Math.max(1, Math.round(pot * frac)));
    if (amount >= room) return { action: "all-in", amount: stack };
    return { action: "bet", amount };
  }
  return base;
}

function zeroByPosition(): Record<TablePosition, number> {
  return { BTN: 0, SB: 0, BB: 0, EP: 0, MP: 0, CO: 0 };
}

/**
 * Corre nHands manos headless.
 * Sobrecargas:
 * - runSelfPlay(nHands, seed, strategy?) → corrida determinista (tests/training).
 * - runSelfPlay(nHands, strategy?) → seed wall-clock (panel UI).
 * - No toca React/DOM. Parchea Math.random con mulberry32(seed) durante la corrida
 *   (getAiAction y shuffle usan Math.random) y lo restaura al salir.
 * - No muta la estrategia de entrada: trabaja sobre un clon y devuelve updatedStrategy.
 * - Reward en bb (bb=20): (stackFinalHeroe - 1000) / 20.
 * - Update regret simple por mano: w[idx] += LR * clamp(rewardBB/20, -1, 1), clip 0-1.
 */
export function runSelfPlay(nHands: number, strategy?: StrategyVersion): SelfPlayResult;
export function runSelfPlay(nHands: number, seed: number, strategy?: StrategyVersion): SelfPlayResult;
export function runSelfPlay(
  nHands: number,
  seedOrStrategy?: number | StrategyVersion,
  maybeStrategy?: StrategyVersion,
): SelfPlayResult {
  let seed: number;
  let strategy: StrategyVersion | undefined;
  if (seedOrStrategy !== undefined && typeof seedOrStrategy === "object") {
    seed = Date.now() >>> 0;
    strategy = seedOrStrategy;
  } else {
    seed = seedOrStrategy ?? Date.now() >>> 0;
    strategy = maybeStrategy;
  }
  if (!Number.isInteger(nHands) || nHands < 0) throw new Error("nHands debe ser entero >= 0");
  if (!Number.isFinite(seed)) throw new Error("seed debe ser finito");

  const working = strategy ? cloneStrategy(strategy) : cloneStrategy(DEFAULT_STRATEGY);
  const NUM_PLAYERS = 6;
  const STARTING_STACK = 1000;
  const SB = 10;
  const BB = 20;

  if (nHands === 0) {
    return {
      hands: 0,
      winrateBB100: 0,
      winrateBb100: 0,
      byPosition: zeroByPosition(),
      showdownPct: 0,
      experiences: [],
      updatedStrategy: working,
    };
  }

  const rng = mulberry32(seed);
  const originalRandom = Math.random;
  Math.random = rng;
  try {
    let totalProfitBB = 0;
    let showdownCount = 0;
    const posSum = zeroByPosition();
    const posCount: Record<TablePosition, number> = { BTN: 0, SB: 0, BB: 0, EP: 0, MP: 0, CO: 0 };
    const experiences: Experience[] = [];

    for (let h = 0; h < nHands; h++) {
      const button = h % NUM_PLAYERS;
      const state = newHand(NUM_PLAYERS, STARTING_STACK, SB, BB, button);
      postBlinds(state);
      deal(state);
      refreshPot(state);

      const hero = state.players[0];
      const heroHole: Card[] = [...hero.hole];
      const heroPos = positionOfSeat(0, button, NUM_PLAYERS);
      let heroLastAction = "check";

      // Inversión por calle (blinds ya cuentan en preflop).
      let invested = new Array<number>(NUM_PLAYERS).fill(0);
      const sbIdx = (button + 1) % NUM_PLAYERS;
      const bbIdx = (button + 2) % NUM_PLAYERS;
      invested[sbIdx] = Math.min(SB, state.players[sbIdx]?.bet ?? 0);
      invested[bbIdx] = Math.min(BB, state.players[bbIdx]?.bet ?? 0);

      let handOver = false;
      let reachedShowdown = false;
      const streets = ["preflop", "flop", "turn", "river"] as const;

      for (let si = 0; si < streets.length && !handOver; si++) {
        // Rondas de apuesta (máx 3 pasadas por calle para responder a raises).
        for (let pass = 0; pass < 3 && !handOver; pass++) {
          const startOffset = si === 0 ? 3 : 1; // preflop UTG, postflop SB
          let raisedThisPass = false;
          for (let k = 0; k < NUM_PLAYERS; k++) {
            const idx = (button + startOffset + k) % NUM_PLAYERS;
            const p = state.players[idx];
            if (!p || p.folded || p.allIn) continue;
            const active = state.players.filter((q) => !q.folded);
            if (active.length <= 1) {
              handOver = true;
              break;
            }
            const toCall = Math.max(0, state.currentBet - (invested[p.id] ?? 0));
            const strength = estimateStrength(p.hole, state.board);
            const pos = positionOfSeat(p.id, button, NUM_PLAYERS);
            const act = decideWithStrategy(strength, toCall, state.pot, p.stack, BB, pos, working);
            if (p.id === 0) heroLastAction = act.action;

            if (act.action === "fold") {
              p.folded = true;
            } else if (act.action === "check") {
              if (toCall > 0) p.folded = true; // seguridad: nunca check gratis ante apuesta
            } else if (act.action === "call") {
              const pay = Math.min(p.stack, Math.max(0, toCall));
              p.stack -= pay;
              p.bet += pay;
              invested[p.id] = (invested[p.id] ?? 0) + pay;
              if (p.stack === 0) p.allIn = true;
              refreshPot(state);
            } else if (act.action === "bet") {
              const total = toCall + act.amount;
              const pay = Math.min(p.stack, Math.max(0, total));
              p.stack -= pay;
              p.bet += pay;
              invested[p.id] = (invested[p.id] ?? 0) + pay;
              const newLevel = invested[p.id] ?? 0;
              if (newLevel > state.currentBet) {
                state.currentBet = newLevel;
                raisedThisPass = true;
              }
              if (p.stack === 0) p.allIn = true;
              refreshPot(state);
            } else {
              // all-in
              const pay = p.stack;
              p.stack = 0;
              p.allIn = true;
              p.bet += pay;
              invested[p.id] = (invested[p.id] ?? 0) + pay;
              if ((invested[p.id] ?? 0) > state.currentBet) {
                state.currentBet = invested[p.id] ?? state.currentBet;
                raisedThisPass = true;
              }
              refreshPot(state);
            }
          }
          const remaining = state.players.filter((q) => !q.folded);
          if (remaining.length <= 1) {
            handOver = true;
            break;
          }
          if (!raisedThisPass) break;
        }

        const remaining = state.players.filter((q) => !q.folded);
        if (remaining.length <= 1) {
          handOver = true;
          break;
        }
        if (si < streets.length - 1) {
          advanceStreet(state);
          state.currentBet = 0;
          invested = new Array<number>(NUM_PLAYERS).fill(0);
        }
      }

      const survivors = state.players.filter((q) => !q.folded);
      if (!handOver && survivors.length > 1) {
        showdown(state);
        reachedShowdown = true;
      } else if (survivors.length === 1) {
        const winner = survivors[0];
        if (winner) {
          refreshPot(state);
          winner.stack += state.pot;
        }
        reachedShowdown = false;
      } else {
        // Caso borde (todos fold menos all-ins ya resueltos): resuelve igual.
        showdown(state);
        reachedShowdown = true;
      }

      const finalHero = state.players[0]?.stack ?? STARTING_STACK;
      const rewardBB = (finalHero - STARTING_STACK) / BB;
      totalProfitBB += rewardBB;
      posSum[heroPos] += rewardBB;
      posCount[heroPos] += 1;
      if (reachedShowdown) showdownCount++;

      experiences.push({
        handId: `${seed}:${h}`,
        position: heroPos,
        action: heroLastAction,
        rewardBB,
      });

      // Regret simple sobre la clase de mano del héroe.
      const idx = handClassIndex(heroHole);
      const delta = SELFPLAY_LR * clamp(rewardBB / 20, -1, 1);
      const cur = working.rangeWeights[idx] ?? 0.5;
      working.rangeWeights[idx] = clip01(cur + delta);
    }

    const byPosition = zeroByPosition();
    for (const pos of TABLE_POSITIONS) {
      const c = posCount[pos] ?? 0;
      byPosition[pos] = c > 0 ? (posSum[pos] ?? 0) / c : 0;
    }

    const winrateBB100 = (totalProfitBB / nHands) * 100;
    return {
      hands: nHands,
      winrateBB100,
      winrateBb100: winrateBB100,
      byPosition,
      showdownPct: showdownCount / nHands,
      experiences,
      updatedStrategy: working,
    };
  } finally {
    Math.random = originalRandom;
  }
}
