// Estructura de premios y eliminaciones del SNG 6-max.
// 6 jugadores × 1000 fichas = pozo 6000; cobran los 2 primeros (65/35).

/** Situación de un jugador en el torneo. */
export interface Standing {
  playerId: number;
  chips: number;
  eliminated: boolean;
  /** Puesto final 1-6; null mientras sigue vivo. */
  place: number | null;
}

/** Jugadores del SNG. */
export const NUM_PLAYERS = 6;

/** Stack inicial por jugador. */
export const STARTING_CHIPS = 1000;

/** Pozo total: 6 × 1000. */
export const TOTAL_PRIZE = NUM_PLAYERS * STARTING_CHIPS;

/** Puestos que cobran. */
export const PAID_PLACES = 2;

/** Porcentaje del pozo por puesto (6-max): 65/35, resto 0. Suma 100. */
export const PAYOUT_PCT: readonly number[] = [65, 35, 0, 0, 0, 0] as const;

/** Premio en fichas por puesto sobre el pozo de 6000: [3900, 2100, 0, 0, 0, 0]. */
export const PAYOUTS: readonly number[] = PAYOUT_PCT.map(
  (pct) => (TOTAL_PRIZE * pct) / 100,
);

/**
 * Puesto que recibe el próximo eliminado: con `aliveCount` vivos,
 * el que cae queda en la posición `aliveCount` (ej. 6 vivos → 6.º).
 */
export function nextEliminatedPlace(aliveCount: number): number {
  if (!Number.isInteger(aliveCount) || aliveCount < 1 || aliveCount > NUM_PLAYERS) {
    throw new Error(`aliveCount debe ser entero 1-${NUM_PLAYERS}`);
  }
  return aliveCount;
}

/** True si el puesto cobra (1.º o 2.º). */
export function isITM(place: number | null): boolean {
  return place !== null && place >= 1 && place <= PAID_PLACES;
}

/** True en burbuja: 3 vivos, el próximo eliminado cae fuera de premios. */
export function isBubble(aliveCount: number): boolean {
  return aliveCount === PAID_PLACES + 1;
}
