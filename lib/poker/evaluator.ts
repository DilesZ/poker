// Evaluador de manos 5 y 7 cartas. Sin dependencias.
// Categorías 0-8: high, pair, two pair, trips, straight, flush, full, quads, straight-flush.
import type { Card } from "./types";

export interface HandRank {
  /** 0=high … 8=straight-flush. */
  category: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  name: string;
  /** Desempate lexicográfico (mayor gana). */
  tiebreak: number[];
}

export const CATEGORY_NAMES = [
  "high card",
  "pair",
  "two pair",
  "three of a kind",
  "straight",
  "flush",
  "full house",
  "four of a kind",
  "straight flush",
] as const;

/** Compara dos ranks: >0 gana a, <0 pierde, 0 empate. */
export function compareRanks(a: HandRank, b: HandRank): number {
  if (a.category !== b.category) return a.category - b.category;
  const n = Math.max(a.tiebreak.length, b.tiebreak.length);
  for (let i = 0; i < n; i++) {
    const x = a.tiebreak[i] ?? 0;
    const y = b.tiebreak[i] ?? 0;
    if (x !== y) return x - y;
  }
  return 0;
}

/** Rango alto de escalera (5 en wheel A-2-3-4-5), o null si no hay. */
function straightHigh(ranksDesc: number[]): number | null {
  const uniq = [...new Set(ranksDesc)];
  if (uniq.length !== 5) return null;
  const [a, b, c, d, e] = uniq as [number, number, number, number, number];
  // Normal: consecutivos descendentes.
  if (a - 1 === b && b - 1 === c && c - 1 === d && d - 1 === e) return a;
  // Wheel: A-5-4-3-2.
  if (a === 14 && b === 5 && c === 4 && d === 3 && e === 2) return 5;
  return null;
}

/** Evalúa exactamente 5 cartas. */
export function evaluate5(cards: Card[]): HandRank {
  if (cards.length !== 5) throw new Error(`evaluate5 necesita 5 cartas, recibió ${cards.length}`);
  const ranks = cards.map((c) => c.rank).sort((x, y) => y - x);
  const flush = cards.every((c) => c.suit === cards[0]?.suit);
  const sHigh = straightHigh(ranks);

  // Conteo por rango: [rank, count] ordenado por count y luego rank.
  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const mk = (category: HandRank["category"], tiebreak: number[]): HandRank => ({
    category,
    name: CATEGORY_NAMES[category],
    tiebreak,
  });

  // Straight flush (incluye wheel del mismo palo).
  if (flush && sHigh !== null) return mk(8, [sHigh]);
  if (groups[0]?.[1] === 4) {
    const quad = groups[0][0] as number;
    const kicker = groups[1]?.[0] ?? 0;
    return mk(7, [quad, kicker]);
  }
  if (groups[0]?.[1] === 3 && groups[1]?.[1] === 2) {
    return mk(6, [groups[0][0] as number, groups[1][0] as number]);
  }
  if (flush) return mk(5, ranks);
  if (sHigh !== null) return mk(4, [sHigh]);
  if (groups[0]?.[1] === 3) {
    const trip = groups[0][0] as number;
    const kickers = groups.slice(1).map((g) => g[0]).sort((x, y) => y - x);
    return mk(3, [trip, ...kickers]);
  }
  if (groups[0]?.[1] === 2 && groups[1]?.[1] === 2) {
    const hp = Math.max(groups[0][0] as number, groups[1][0] as number);
    const lp = Math.min(groups[0][0] as number, groups[1][0] as number);
    const kicker = groups[2]?.[0] ?? 0;
    return mk(2, [hp, lp, kicker]);
  }
  if (groups[0]?.[1] === 2) {
    const pair = groups[0][0] as number;
    const kickers = groups.slice(1).map((g) => g[0]).sort((x, y) => y - x);
    return mk(1, [pair, ...kickers]);
  }
  return mk(0, ranks);
}

/** Evalúa 5-7 cartas: mejor quinteto (21 combos en 7). */
export function evaluate7(cards: Card[]): HandRank {
  if (cards.length < 5 || cards.length > 7) {
    throw new Error(`evaluate7 necesita 5-7 cartas, recibió ${cards.length}`);
  }
  let best: HandRank | null = null;
  const n = cards.length;
  // Itera combinaciones C(n,5) con 5 índices.
  const idx = [0, 1, 2, 3, 4];
  for (;;) {
    const hand = idx.map((i) => cards[i] as Card);
    const r = evaluate5(hand);
    if (!best || compareRanks(r, best) > 0) best = r;
    // Siguiente combinación lexicográfica.
    let i = 4;
    while (i >= 0 && idx[i] === n - 5 + i) i--;
    if (i < 0) break;
    idx[i]++;
    for (let j = i + 1; j < 5; j++) idx[j] = (idx[j - 1] as number) + 1;
  }
  // best nunca null (al menos un combo).
  return best as HandRank;
}
