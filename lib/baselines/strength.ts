// Fuerza de mano para los baselines: tiers preflop y mejor quinteto.
// Español. Cero dependencias (solo tipos + evaluador). Sin azar.
import type { Card } from "@/lib/poker/types";
import type { HandRank } from "@/lib/poker/evaluator";
import { compareRanks, evaluate5 } from "@/lib/poker/evaluator";

/** Tier preflop: 1 = premium … 5 = basura. */
export type PreflopTier = 1 | 2 | 3 | 4 | 5;

/**
 * Clasifica una mano inicial en 5 tiers.
 * - 1: AA KK QQ JJ AKs.
 * - 2: TT AKo AQs AJs KQs.
 * - 3: 99 88 AQo ATs KJs QJs JTs.
 * - 4: resto de suited, broadways offsuit y pares bajos (22-77).
 * - 5: basura offsuit (sin pareja, no broadway, no suited).
 */
export function preflopTier(hole: [Card, Card]): PreflopTier {
  const [a, b] = hole;
  const suited = a.suit === b.suit;
  // Pareja: por rango (las altas dominan).
  if (a.rank === b.rank) {
    if (a.rank >= 11) return 1; // JJ+
    if (a.rank === 10) return 2; // TT
    if (a.rank >= 8) return 3; // 99 88
    return 4; // 77-
  }
  const hi = Math.max(a.rank, b.rank);
  const lo = Math.min(a.rank, b.rank);
  const clave = `${hi}-${lo}${suited ? "s" : "o"}`;
  if (clave === "14-13s") return 1; // AKs
  if (
    clave === "14-13o" || // AKo
    clave === "14-12s" || // AQs
    clave === "14-11s" || // AJs
    clave === "13-12s" // KQs
  ) {
    return 2;
  }
  if (
    clave === "14-12o" || // AQo
    clave === "14-10s" || // ATs
    clave === "13-11s" || // KJs
    clave === "12-11s" || // QJs
    clave === "11-10s" // JTs
  ) {
    return 3;
  }
  // Resto suited, broadways offsuit (ambas ≥ T) y el resto de figuras ligadas.
  if (suited) return 4;
  if (hi >= 10 && lo >= 10) return 4; // Broadways offsuit: KQo, KJo…
  return 5;
}

/**
 * Mejor quinteto de n ≥ 5 cartas (C(n,5) con evaluate5 + compareRanks).
 * Lanza si hay menos de 5 cartas.
 */
export function best5(cartas: Card[]): HandRank {
  if (cartas.length < 5) {
    throw new Error(`best5 necesita al menos 5 cartas, recibió ${cartas.length}.`);
  }
  let mejor: HandRank | null = null;
  const n = cartas.length;
  const idx = [0, 1, 2, 3, 4];
  for (;;) {
    const mano = idx.map((i) => cartas[i] as Card);
    const r = evaluate5(mano);
    if (!mejor || compareRanks(r, mejor) > 0) mejor = r;
    // Siguiente combinación lexicográfica de 5 índices.
    let i = 4;
    while (i >= 0 && idx[i] === n - 5 + i) i--;
    if (i < 0) break;
    idx[i] = (idx[i] as number) + 1;
    for (let j = i + 1; j < 5; j++) idx[j] = (idx[j - 1] as number) + 1;
  }
  return mejor as HandRank;
}

/**
 * Categoría de la mejor mano (0 = carta alta … 8 = escalera de color).
 * Con ≥5 cartas evalúa hole+board; con menos devuelve -1 (sin valor de showdown).
 */
export function madeCategory(cartas: Card[]): number {
  if (cartas.length < 5) return -1;
  return best5(cartas).category;
}
