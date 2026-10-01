// Estructura de ciegas del SNG 6-max: sube cada `handsPerLevel` manos.
// Niveles 1-3 sin ante; ante desde el nivel 4 (índice 3).

/** Nivel de ciegas: small blind, big blind y ante por jugador. */
export interface BlindLevel {
  sb: number;
  bb: number;
  ante: number;
}

/** 7 niveles: [10/20/0, 15/30/0, 20/40/0, 30/60/6, 50/100/10, 75/150/15, 100/200/20]. */
export const LEVELS: readonly BlindLevel[] = [
  { sb: 10, bb: 20, ante: 0 },
  { sb: 15, bb: 30, ante: 0 },
  { sb: 20, bb: 40, ante: 0 },
  { sb: 30, bb: 60, ante: 6 },
  { sb: 50, bb: 100, ante: 10 },
  { sb: 75, bb: 150, ante: 15 },
  { sb: 100, bb: 200, ante: 20 },
] as const;

/**
 * Nivel (índice en LEVELS) para la mano `handIndex` (0-based).
 * Sube un nivel cada `handsPerLevel` manos y se queda en el último nivel.
 */
export function levelForHand(handIndex: number, handsPerLevel = 6): number {
  if (!Number.isFinite(handIndex)) throw new Error("handIndex debe ser finito");
  if (!Number.isInteger(handsPerLevel) || handsPerLevel <= 0) {
    throw new Error("handsPerLevel debe ser entero > 0");
  }
  const clamped = Math.max(0, Math.floor(handIndex));
  const level = Math.floor(clamped / handsPerLevel);
  return Math.min(level, LEVELS.length - 1);
}

/** Ciegas del nivel indicado (índice clampado al rango válido). */
export function blindsForLevel(level: number): BlindLevel {
  const i = Math.min(Math.max(0, Math.floor(level)), LEVELS.length - 1);
  const found = LEVELS[i];
  if (!found) throw new Error("nivel fuera de rango");
  return found;
}

/** Ciegas de la mano `handIndex`. */
export function blindsForHand(handIndex: number, handsPerLevel = 6): BlindLevel {
  return blindsForLevel(levelForHand(handIndex, handsPerLevel));
}
