// Equity Monte Carlo Texas Hold'em. Sin dependencias salvo deck/evaluator.
import { newDeck, shuffle } from "./deck";
import { compareRanks, evaluate7 } from "./evaluator";
import type { Card, Street } from "./types";

/** RNG inyectable (Math.random por defecto, seed fija en tests). */
export type Rng = () => number;

export interface EquityInputs {
  hole: Card[];
  board: Card[];
  numOpp: number;
  iters?: number;
}

function cardKey(c: Card): string {
  return `${c.rank}${c.suit}`;
}

/**
 * Equity Monte Carlo del héroe (0-1) frente a `numOpp` oponentes aleatorios.
 * Excluye cartas conocidas, completa el board hasta 5 y reparte holes rivales
 * al azar en cada iteración. Empates reparten (1 / nº empatados en cabeza).
 */
export function calcEquity(
  hole: Card[],
  board: Card[],
  numOpp: number,
  iters = 1000,
  rng: Rng = Math.random,
): number {
  if (hole.length !== 2) throw new Error("calcEquity necesita hole de 2 cartas");
  if (board.length > 5) throw new Error("calcEquity: board máximo 5 cartas");
  if (!Number.isInteger(numOpp) || numOpp < 1) throw new Error("numOpp debe ser >= 1");
  if (!Number.isInteger(iters) || iters < 1) throw new Error("iters debe ser >= 1");

  const known = new Set([...hole, ...board].map(cardKey));
  const base = newDeck().filter((c) => !known.has(cardKey(c)));
  const needBoard = 5 - board.length;

  let acc = 0;
  for (let i = 0; i < iters; i++) {
    const deck = shuffle([...base], rng);
    let idx = 0;
    const fullBoard = [...board, ...deck.slice(idx, idx + needBoard)];
    idx += needBoard;

    const heroRank = evaluate7([...hole, ...fullBoard]);
    let best = heroRank;
    const oppRanks = [];
    for (let o = 0; o < numOpp; o++) {
      const oppHole = deck.slice(idx, idx + 2);
      idx += 2;
      const r = evaluate7([...oppHole, ...fullBoard]);
      oppRanks.push(r);
      if (compareRanks(r, best) > 0) best = r;
    }
    if (compareRanks(heroRank, best) < 0) continue;
    // Héroe empata o gana: reparte entre todos los empatados en cabeza.
    let tied = 1; // héroe
    for (const r of oppRanks) if (compareRanks(r, best) === 0) tied++;
    acc += 1 / tied;
  }
  return acc / iters;
}

/**
 * Conteo simple de outs (proyecto de mejora a una carta).
 * - Color: 4 del mismo palo entre hole+board → 9 outs (si ya hay 5+, 0).
 * - Escalera: por cada ventana de 5 rangos con exactamente 4 presentes → +4.
 *   (gutshot = 1 ventana → 4; abierta = 2 ventanas → 8).
 */
export function countOuts(hole: Card[], board: Card[]): number {
  if (hole.length !== 2) return 0;
  const all = [...hole, ...board];
  if (all.length < 4) return 0;

  let outs = 0;

  // Flush draw.
  const suits = new Map<string, number>();
  for (const c of all) suits.set(c.suit, (suits.get(c.suit) ?? 0) + 1);
  for (const n of suits.values()) {
    if (n === 4) outs += 9;
  }

  // Straight draws sobre rangos únicos (As vale 14 y 1).
  const ranks = new Set<number>();
  for (const c of all) ranks.add(c.rank);
  if (ranks.has(14)) ranks.add(1);
  for (let low = 1; low <= 10; low++) {
    let inside = 0;
    for (let r = low; r < low + 5; r++) if (ranks.has(r)) inside++;
    if (inside === 4) outs += 4;
  }

  return outs;
}

/** Regla del 2 y 4: flop (2 cartas por ver) outs×4%, turn (1 carta) outs×2%. */
export function equityRegla24(outs: number, street: Street | string): number {
  const o = Math.max(0, outs);
  if (street === "flop" || street === "preflop") return Math.min(1, (o * 4) / 100);
  if (street === "turn") return Math.min(1, (o * 2) / 100);
  return 0;
}
