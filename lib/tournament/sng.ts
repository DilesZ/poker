// Estructura de SNG 6-max local (demo, sin dinero real).
// Niveles cada HANDS_PER_LEVEL manos. Paga 2: burbuja con 3 vivos, ITM con ≤2.
export interface BlindLevel {
  sb: number;
  bb: number;
  ante: number;
}

export const SNG_LEVELS: BlindLevel[] = [
  { sb: 10, bb: 20, ante: 0 },
  { sb: 15, bb: 30, ante: 0 },
  { sb: 25, bb: 50, ante: 0 },
  { sb: 50, bb: 100, ante: 10 },
  { sb: 75, bb: 150, ante: 15 },
  { sb: 100, bb: 200, ante: 25 },
  { sb: 150, bb: 300, ante: 50 },
];

/** Manos por nivel antes de subir ciegas. */
export const HANDS_PER_LEVEL = 8;

/** Stack inicial del SNG (fichas de torneo, sin valor monetario). */
export const SNG_STARTING_STACK = 1500;

/** Puestos pagados en el 6-max. */
export const SNG_PAID = 2;

/** Fichas convertidas a ciegas grandes (1 decimal). */
export function chipsToBb(chips: number, bb: number): number {
  if (bb <= 0) return 0;
  return Math.round((Math.max(0, chips) / bb) * 10) / 10;
}
