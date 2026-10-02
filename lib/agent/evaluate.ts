// Evaluación headless del cerebro virgen vs heurística (council P0).
// Pura, síncrona, determinista por seed. No importa runSelfPlay (necesita
// override del héroe): implementa su propio loop reutilizando el motor,
// estimateStrength/positionOfSeat/decideFor de selfplay y chooseBrainAction.
import { advanceStreet, deal, newHand, postBlinds, refreshPot, showdown } from "../poker/game";
import type { Street } from "../poker/types";
import { decideFor, estimateStrength, mulberry32, positionOfSeat } from "../training/selfplay";
import { cloneStrategy, DEFAULT_STRATEGY } from "../training/strategy";
import { chooseBrainAction, type Brain, type BrainContext, type BrainLegal } from "./brain";

export interface BrainEvalOpts {
  hands?: number;
  seed?: number;
  heroSeat?: number;
}

export interface BrainEvalResult {
  hands: number;
  bb100: number;
  sd: number;
  ci95: number;
  byPosition: Record<string, number>;
  showdownPct: number;
  brainDecisions: number;
}

const POS_KEYS = ["BTN", "SB", "BB", "EP", "MP", "CO"] as const;

function zeroByPos(): Record<string, number> {
  return { BTN: 0, SB: 0, BB: 0, EP: 0, MP: 0, CO: 0 };
}

/**
 * Evalúa el cerebro en `hands` manos headless 6-max.
 * Héroe (seat configurable, default 0) decide vía chooseBrainAction con
 * contexto legal como roomEngine.legales; rivales con decideFor heurístico.
 * Determinista por seed (parchea Math.random como selfplay y restaura).
 */
export function runBrainEval(brain: Brain, opts: BrainEvalOpts = {}): BrainEvalResult {
  const nHands = opts.hands ?? 1000;
  const seed = opts.seed ?? 12345;
  const heroSeat = Number.isInteger(opts.heroSeat) ? (opts.heroSeat as number) : 0;
  const NUM_PLAYERS = 6;
  const STARTING_STACK = 1000;
  const SB = 10;
  const BB = 20;
  const hero = heroSeat >= 0 && heroSeat < NUM_PLAYERS ? heroSeat : 0;

  if (!Number.isInteger(nHands) || nHands <= 0) {
    return { hands: 0, bb100: 0, sd: 0, ci95: 0, byPosition: zeroByPos(), showdownPct: 0, brainDecisions: 0 };
  }
  if (!Number.isFinite(seed)) throw new Error("seed debe ser finito");

  const working = cloneStrategy(DEFAULT_STRATEGY);
  const rng = mulberry32(seed >>> 0);
  const originalRandom = Math.random;
  Math.random = rng;
  try {
    let totalProfitBB = 0;
    let showdownCount = 0;
    let brainDecisions = 0;
    const rewards: number[] = [];
    const posSum: Record<string, number> = zeroByPos();
    const posCount: Record<string, number> = zeroByPos();
    const streets = ["preflop", "flop", "turn", "river"] as const;

    for (let h = 0; h < nHands; h++) {
      const button = h % NUM_PLAYERS;
      const state = newHand(NUM_PLAYERS, STARTING_STACK, SB, BB, button);
      postBlinds(state);
      deal(state);
      refreshPot(state);

      const heroPos = positionOfSeat(hero, button, NUM_PLAYERS);
      const seatPos = state.players.map((pl) => positionOfSeat(pl.id, button, NUM_PLAYERS));

      let invested = new Array<number>(NUM_PLAYERS).fill(0);
      const sbIdx = (button + 1) % NUM_PLAYERS;
      const bbIdx = (button + 2) % NUM_PLAYERS;
      invested[sbIdx] = Math.min(SB, state.players[sbIdx]?.bet ?? 0);
      invested[bbIdx] = Math.min(BB, state.players[bbIdx]?.bet ?? 0);

      let handOver = false;
      let reachedShowdown = false;
      const strengthCache: (number | undefined)[][] = Array.from(
        { length: NUM_PLAYERS },
        () => [undefined, undefined, undefined, undefined],
      );
      const strengthOf = (pid: number, si: number, hole: { rank: number; suit: string }[] | never[] | import("../poker/types").Card[], board: import("../poker/types").Card[]): number => {
        if (si === 0) return estimateStrength(hole as import("../poker/types").Card[], board);
        const cached = strengthCache[pid]?.[si];
        if (cached !== undefined) return cached;
        const s = estimateStrength(hole as import("../poker/types").Card[], board);
        const row = strengthCache[pid];
        if (row) row[si] = s;
        return s;
      };

      for (let si = 0; si < streets.length && !handOver; si++) {
        for (let pass = 0; pass < 3 && !handOver; pass++) {
          const startOffset = si === 0 ? 3 : 1;
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
            const strength = strengthOf(p.id, si, p.hole, state.board);

            if (p.id === hero) {
              const inv = invested[p.id] ?? 0;
              const candidates: { type: "fold" | "check" | "call" | "raise" | "allin"; size?: number }[] = [];
              if (toCall > 0) candidates.push({ type: "fold" });
              else candidates.push({ type: "check" });
              if (toCall > 0 && p.stack > toCall) candidates.push({ type: "call" });
              if (inv + p.stack > state.currentBet) candidates.push({ type: "raise" });
              if (p.stack > 0) candidates.push({ type: "allin" });
              const legal = { candidates, toCall, pot: state.pot, stack: p.stack } as BrainLegal;
              let numRivales = 0;
              for (const q of state.players) if (q.id !== p.id && !q.folded) numRivales++;
              const ctx = {
                street: (streets[si] ?? "preflop") as Street,
                boardLen: state.board.length,
                myStack: p.stack,
                pot: state.pot,
                toCall,
                numRivales,
                strength,
              } as BrainContext;
              const ba = chooseBrainAction(brain, legal, ctx);
              brainDecisions++;
              if (ba.type === "fold") {
                p.folded = true;
              } else if (ba.type === "check") {
                if (toCall > 0) p.folded = true;
              } else if (ba.type === "call") {
                const pay = Math.min(p.stack, Math.max(0, toCall));
                p.stack -= pay;
                p.bet += pay;
                invested[p.id] = (invested[p.id] ?? 0) + pay;
                if (p.stack === 0) p.allIn = true;
                refreshPot(state);
              } else if (ba.type === "raise" || (ba.type as string) === "bet") {
                const size = typeof ba.size === "number" ? ba.size : Math.max(1, Math.round(state.pot * 0.5));
                const betAmt = size - toCall;
                if (betAmt <= 0) {
                  const pay = Math.min(p.stack, Math.max(0, toCall));
                  p.stack -= pay;
                  p.bet += pay;
                  invested[p.id] = (invested[p.id] ?? 0) + pay;
                  if (p.stack === 0) p.allIn = true;
                  refreshPot(state);
                } else {
                  const total = toCall + betAmt;
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
                }
              } else {
                // allin
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
              continue;
            }

            const pos = seatPos[p.id] ?? positionOfSeat(p.id, button, NUM_PLAYERS);
            const act = decideFor(p.id, strength, toCall, state.pot, p.stack, BB, pos, working);
            if (act.action === "fold") {
              p.folded = true;
            } else if (act.action === "check") {
              if (toCall > 0) p.folded = true;
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
        showdown(state);
        reachedShowdown = true;
      }

      const finalHero = state.players[hero]?.stack ?? STARTING_STACK;
      const rewardBB = (finalHero - STARTING_STACK) / BB;
      totalProfitBB += rewardBB;
      rewards.push(rewardBB);
      posSum[heroPos] = (posSum[heroPos] ?? 0) + rewardBB;
      posCount[heroPos] = (posCount[heroPos] ?? 0) + 1;
      if (reachedShowdown) showdownCount++;
    }

    const byPosition = zeroByPos();
    for (const key of POS_KEYS) {
      const c = posCount[key] ?? 0;
      byPosition[key] = c > 0 ? (posSum[key] ?? 0) / c : 0;
    }
    const mean = totalProfitBB / nHands;
    let variance = 0;
    for (const r of rewards) variance += (r - mean) * (r - mean);
    variance = nHands > 0 ? variance / nHands : 0;
    const sd = Math.sqrt(Math.max(0, variance));
    const bb100 = mean * 100;
    const ci95 = nHands > 0 ? ((1.96 * sd) / Math.sqrt(nHands)) * 100 : 0;
    return {
      hands: nHands,
      bb100,
      sd,
      ci95,
      byPosition,
      showdownPct: nHands > 0 ? showdownCount / nHands : 0,
      brainDecisions,
    };
  } finally {
    Math.random = originalRandom;
  }
}
