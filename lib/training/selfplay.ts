// Self-play headless determinista para training v0.2. Sin React, sin DOM.
// Usa newHand(6,1000,10/20)+postBlinds+deal, getAiAction con umbrales de strategy,
// advanceStreet hasta showdown, reward en bb y update de pesos por regret simple.

import { advanceStreet, deal, newHand, postBlinds, refreshPot, showdown } from "../poker/game";
import { getAiAction } from "../poker/ai";
import type { AiAction } from "../poker/ai";
import { evaluate7 } from "../poker/evaluator";
import type { Card } from "../poker/types";
import { DEFAULT_STRATEGY, LR_BASE, LR_BIGPOT, TABLE_POSITIONS, cloneStrategy } from "./strategy";
import type { StrategyVersion, TablePosition } from "./strategy";
import type { Experience } from "./experience";

/** Learning rate del regret simple (legacy v1, conservado por compat). */
export const SELFPLAY_LR = 0.05;
/** Learning rate v2 (6 updates/mano, thresholds + sizing). */
export const SELFPLAY_LR_V2 = 0.08;

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

/** Traza de una decisión dentro de una mano (v2: 6 jugadores). */
export interface DecisionTrace {
  pos: TablePosition;
  handIdx: number;
  action: string;
  strength: number;
  toCall: number;
  pot: number;
  /** Solo para action==="bet": amount apostado (para sizing). */
  amount?: number;
}

/** Elige fracción de bote según sizingWeights (rng inyectable, default Math.random). */
export function pickSizingFraction(
  strategy: StrategyVersion,
  rng: () => number = Math.random,
): number {
  const w33 = Math.max(0, strategy.sizingWeights["33"] ?? 0);
  const w50 = Math.max(0, strategy.sizingWeights["50"] ?? 0);
  const w75 = Math.max(0, strategy.sizingWeights["75"] ?? 0);
  const sum = w33 + w50 + w75;
  if (!(sum > 0)) return 0.5;
  const r = rng() * sum;
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

/**
 * Hook de decisión parametrizable (héroe override en evaluate).
 * Por defecto delega en decideWithStrategy; `seat` solo selecciona
 * quién decide (el override del héroe lo usa evaluate).
 */
export function decideFor(
  seat: number,
  strength: number,
  toCall: number,
  pot: number,
  stack: number,
  bb: number,
  pos: TablePosition,
  working: StrategyVersion,
): AiAction {
  void seat;
  return decideWithStrategy(strength, toCall, pot, stack, bb, pos, working);
}

const RANGOS_CORTOS: Record<number, string> = { 11: "J", 12: "Q", 13: "K", 14: "A" };

/** Carta corta "A♠" para la traza real del héroe. */
function cartaCorta(c: Card): string {
  return `${RANGOS_CORTOS[c.rank] ?? c.rank}${c.suit}`;
}

/** bet→raise, all-in→allin, resto igual en minúsculas. */
function mapHeroType(a: string): string {
  const t = (a ?? "").trim().toLowerCase();
  if (t === "bet") return "raise";
  if (t === "all-in" || t === "allin") return "allin";
  return t;
}

/** Calle final desde el board (claves del trainer: preflop/flop/turn/river). */
function calleFinal(boardLen: number): string {
  if (boardLen >= 5) return "river";
  if (boardLen === 4) return "turn";
  if (boardLen === 3) return "flop";
  return "preflop";
}

function zeroByPosition(): Record<TablePosition, number> {
  return { BTN: 0, SB: 0, BB: 0, EP: 0, MP: 0, CO: 0 };
}

function clipThr(x: number): number {
  if (!Number.isFinite(x)) return 0.5;
  if (x < 0.3) return 0.3;
  if (x > 0.75) return 0.75;
  return x;
}

function renormalizeSizing(sw: { "33": number; "50": number; "75": number }): void {
  // Clip a >=0 y renormaliza a suma 1 (fallback a default si suma inválida).
  let a = Math.max(0, sw["33"] ?? 0);
  let b = Math.max(0, sw["50"] ?? 0);
  let c = Math.max(0, sw["75"] ?? 0);
  let sum = a + b + c;
  if (!(sum > 0) || !Number.isFinite(sum)) {
    sw["33"] = 0.3;
    sw["50"] = 0.5;
    sw["75"] = 0.2;
    return;
  }
  sw["33"] = a / sum;
  sw["50"] = b / sum;
  sw["75"] = c / sum;
}

function closestSizingKey(ratio: number): "33" | "50" | "75" {
  const d33 = Math.abs(ratio - 0.33);
  const d50 = Math.abs(ratio - 0.5);
  const d75 = Math.abs(ratio - 0.75);
  if (d33 <= d50 && d33 <= d75) return "33";
  if (d50 <= d75) return "50";
  return "75";
}

/**
 * Corre nHands manos headless (v2: aprendizaje x10).
 * Sobrecargas:
 * - runSelfPlay(nHands, seed, strategy?) → corrida determinista (tests/training).
 * - runSelfPlay(nHands, strategy?) → seed wall-clock (panel UI).
 * - No toca React/DOM. Parchea Math.random con mulberry32(seed) durante la corrida
 *   (getAiAction y shuffle usan Math.random) y lo restaura al salir.
 * - No muta la estrategia de entrada: trabaja sobre un clon y devuelve updatedStrategy.
 * - Reward en bb (bb=20): (stackFinal - 1000) / 20 por jugador; nR=clamp(rewardBB/20,-1,1).
 * - Update v2 por mano (6x + thresholds + sizing):
 *   range (6 updates, uno por jugador con su handIdx):
 *     w += (LR_BASE + (|rewardBB|>10 ? 0.04 : 0)) * nR * (fold&&reward>0 ? 1.2 : 1), clip 0-1.
 *   thresholds (por posición con ≥1 muestra):
 *     thr -= 0.015*nR_avg, clip 0.3-0.75; mom = 0.9*mom + 0.1*nR_avg.
 *   sizing (si ganador usó bet con frac f más cercana a amount/pot):
 *     w[f] += 0.03*nR, renormaliza a suma 1.
 * Antes (v1): 1 update/mano (solo héroe, LR 0.05). Ahora: 6 + thresholds + sizing.
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

      const heroHole: Card[] = [...(state.players[0]?.hole ?? [])];
      const heroPos = positionOfSeat(0, button, NUM_PLAYERS);
      let heroLastAction = "check";
      const heroHoleStr = heroHole.map(cartaCorta).join(" ");
      const heroTraceActions: { street: string; type: string; amount?: number; toCall?: number }[] = [];

      // Traza v2 por jugador: una entrada por decisión (pos/handIdx/action/strength/toCall/pot).
      // Se registra para los 6 (coste acotado: arrays pequeños por mano) y se actualiza TODOs al final.
      const handIdxs: number[] = state.players.map((pl) => handClassIndex(pl.hole));
      const seatPos: TablePosition[] = state.players.map((pl) =>
        positionOfSeat(pl.id, button, NUM_PLAYERS),
      );
      const traces: DecisionTrace[][] = Array.from({ length: NUM_PLAYERS }, () => []);

      // Inversión por calle (blinds ya cuentan en preflop).
      let invested = new Array<number>(NUM_PLAYERS).fill(0);
      const sbIdx = (button + 1) % NUM_PLAYERS;
      const bbIdx = (button + 2) % NUM_PLAYERS;
      invested[sbIdx] = Math.min(SB, state.players[sbIdx]?.bet ?? 0);
      invested[bbIdx] = Math.min(BB, state.players[bbIdx]?.bet ?? 0);

      let handOver = false;
      let reachedShowdown = false;
      const streets = ["preflop", "flop", "turn", "river"] as const;

      // Cache postflop (si>=1): hole+board fijos por calle, evaluate7 caro.
      // Preflop (si=0) heurística barata → sin cache para no añadir overhead.
      const strengthCache: (number | undefined)[][] = Array.from(
        { length: NUM_PLAYERS },
        () => [undefined, undefined, undefined, undefined],
      );
      for (let si = 0; si < streets.length && !handOver; si++) {
        // Rondas de apuesta (máx 3 pasadas por calle para responder a raises).
        for (let pass = 0; pass < 3 && !handOver; pass++) {
          const startOffset = si === 0 ? 3 : 1; // preflop UTG, postflop SB
          let raisedThisPass = false;
          for (let k = 0; k < NUM_PLAYERS; k++) {
            const idx = (button + startOffset + k) % NUM_PLAYERS;
            const p = state.players[idx];
            if (!p || p.folded || p.allIn) continue;
            let activeCount = 0;
            for (const q of state.players) if (!q.folded) activeCount++;
            if (activeCount <= 1) {
              handOver = true;
              break;
            }
            const toCall = Math.max(0, state.currentBet - (invested[p.id] ?? 0));
            let strength: number;
            if (si === 0) {
              strength = estimateStrength(p.hole, state.board);
            } else {
              const cached = strengthCache[p.id]?.[si];
              if (cached !== undefined) {
                strength = cached;
              } else {
                strength = estimateStrength(p.hole, state.board);
                const row = strengthCache[p.id];
                if (row) row[si] = strength;
              }
            }
            const pos = seatPos[p.id] ?? positionOfSeat(p.id, button, NUM_PLAYERS);
            const act = decideFor(p.id, strength, toCall, state.pot, p.stack, BB, pos, working);
            // Traza por decisión (los 6 jugadores).
            const entry: DecisionTrace = {
              pos,
              handIdx: handIdxs[p.id] ?? 84,
              action: act.action,
              strength,
              toCall,
              pot: state.pot,
            };
            if (act.action === "bet") entry.amount = act.amount;
            traces[p.id]?.push(entry);
            if (p.id === 0) {
              heroLastAction = act.action;
              const streetNow = streets[si] ?? "preflop";
              const heroEntry: {
                street: string;
                type: string;
                amount?: number;
                toCall?: number;
              } = { street: streetNow, type: mapHeroType(act.action), toCall };
              if ("amount" in act && typeof (act as { amount?: unknown }).amount === "number") {
                heroEntry.amount = (act as { amount: number }).amount;
              }
              heroTraceActions.push(heroEntry);
            }

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
        heroTrace: {
          hole: heroHoleStr,
          board: state.board.map(cartaCorta).join(" "),
          street: calleFinal(state.board.length),
          actions: heroTraceActions,
          numRivales: 5,
        },
      });

      // ---- Aprendizaje v2: 6 updates/mano + thresholds + sizing ----
      // Rewards por jugador en bb + normalizado nR=clamp(rewardBB/20,-1,1).
      const rewardBBs: number[] = state.players.map(
        (pl) => ((pl?.stack ?? STARTING_STACK) - STARTING_STACK) / BB,
      );
      const nRs: number[] = rewardBBs.map((r) => clamp(r / 20, -1, 1));

      // 1) RangeWeights: un update por jugador con su propio handIdx.
      //    w += (LR_BASE + (|rewardBB|>10 ? 0.04 : 0)) * nR * (fold&&reward>0 ? 1.2 : 1), clip 0-1.
      //    v1 hacía 1 update/mano (solo héroe, LR 0.05); v2 hace 6/mano con LR_BASE 0.08.
      for (let i = 0; i < NUM_PLAYERS; i++) {
        const rBB = rewardBBs[i] ?? 0;
        const nR = nRs[i] ?? 0;
        const lastAct = traces[i]?.[traces[i].length - 1]?.action ?? "check";
        // LR_BIGPOT (0.12) = LR_BASE (0.08) + 0.04 en botes grandes.
        const lr = Math.abs(rBB) > 10 ? LR_BIGPOT : LR_BASE;
        const mult = lastAct === "fold" && rBB > 0 ? 1.2 : 1;
        const d = lr * nR * mult;
        const hi = handIdxs[i] ?? 84;
        working.rangeWeights[hi] = clip01((working.rangeWeights[hi] ?? 0.5) + d);
      }

      // 2) Thresholds por posición: thr -= 0.015*nR_avg (gana→afloja, pierde→aprieta), clip 0.3-0.75.
      //    Momentum: mom = 0.9*mom + 0.1*nR_avg.
      if (!working.thresholdMomentum) {
        working.thresholdMomentum = { BTN: 0, SB: 0, BB: 0, EP: 0, MP: 0, CO: 0 };
      }
      if (!working.sizingMomentum) {
        working.sizingMomentum = { "33": 0, "50": 0, "75": 0 };
      }
      for (const pos of TABLE_POSITIONS) {
        let sum = 0;
        let cnt = 0;
        for (let i = 0; i < NUM_PLAYERS; i++) {
          if (seatPos[i] === pos) {
            sum += nRs[i] ?? 0;
            cnt++;
          }
        }
        if (cnt < 1) continue;
        const avg = sum / cnt;
        const cur = working.pushFoldThresholds[pos] ?? 0.55;
        working.pushFoldThresholds[pos] = clipThr(cur - 0.015 * avg);
        const m = working.thresholdMomentum[pos] ?? 0;
        working.thresholdMomentum[pos] = 0.9 * m + 0.1 * avg;
      }

      // 3) Sizing: si el ganador usó bet con frac f (más cercana a amount/pot),
      //    w[f] += 0.03*nR y renormaliza a suma 1.
      let winnerIds: number[] = [];
      if (state.winners && state.winners.length > 0) {
        winnerIds = [...state.winners];
      } else if (survivors.length === 1 && survivors[0]) {
        winnerIds = [survivors[0].id];
      } else if (survivors.length > 1) {
        winnerIds = survivors.map((s) => s.id);
      }
      winnerIds = [...new Set(winnerIds)];
      for (const wid of winnerIds) {
        const nR = nRs[wid] ?? 0;
        const wTrace = traces[wid] ?? [];
        let lastBet: DecisionTrace | undefined;
        for (let t = wTrace.length - 1; t >= 0; t--) {
          const e = wTrace[t];
          if (e && e.action === "bet" && typeof e.amount === "number" && e.pot > 0) {
            lastBet = e;
            break;
          }
        }
        if (!lastBet) continue;
        const ratio = (lastBet.amount ?? 0) / (lastBet.pot || 1);
        if (!Number.isFinite(ratio)) continue;
        const key = closestSizingKey(ratio);
        working.sizingWeights[key] = (working.sizingWeights[key] ?? 0) + 0.03 * nR;
        working.sizingMomentum[key] = 0.9 * (working.sizingMomentum[key] ?? 0) + 0.1 * nR;
        renormalizeSizing(working.sizingWeights);
      }
      void heroHole;
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
