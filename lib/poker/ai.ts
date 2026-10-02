// IA heurística simple: fuerza 0-1 → fold/call/check/bet 50-75% pot.
export type AiAction =
  | { action: "fold" }
  | { action: "check" }
  | { action: "call"; amount: number }
  | { action: "bet"; amount: number }
  | { action: "all-in"; amount: number };

export interface AiParams {
  /** Fuerza estimada 0-1 (equity o rank normalizado). */
  strength: number;
  /** Fichas por igualar. 0 = pasar gratis. */
  toCall: number;
  pot: number;
  stack: number;
  /** Big blind para detectar short-stack (<10bb → push/fold). */
  bb?: number;
}

/** Apuesta 50-75% del bote, limitada por stack. */
export function valueBet(
  pot: number,
  stack: number,
  toCall: number,
  rng: () => number = Math.random,
): AiAction {
  const room = Math.max(0, stack - toCall);
  if (room <= 0) return { action: "all-in", amount: stack };
  const frac = 0.5 + rng() * 0.25; // 50-75%
  const amount = Math.min(room, Math.max(1, Math.round(pot * frac)));
  if (amount >= room) return { action: "all-in", amount: stack };
  return { action: "bet", amount };
}

/** Decide acción. 15% de aleatoriedad (bluff / varianza). */
export function getAiAction(
  strength: number,
  toCall: number,
  pot: number,
  stack: number,
  bb = 20,
  rng: () => number = Math.random,
): AiAction {
  const s = Math.min(1, Math.max(0, strength));
  const call = Math.max(0, Math.floor(toCall));
  const free = call <= 0;

  // Short-stack: push/fold (<10bb).
  if (stack < 10 * bb) {
    if (free) return s > 0.5 ? { action: "all-in", amount: stack } : { action: "check" };
    if (s > 0.55 || call <= stack * 0.1) return { action: "all-in", amount: stack };
    return { action: "fold" };
  }

  // 15% jugada aleatoria: no juega perfecto.
  if (rng() < 0.15) {
    if (free) return rng() < 0.5 ? { action: "check" } : valueBet(pot, stack, 0, rng);
    return rng() < 0.5 ? { action: "fold" } : { action: "call", amount: Math.min(call, stack) };
  }

  // Sin apuesta previa: check con manos flojas, value bet con fuerza.
  if (free) {
    if (s > 0.65) return valueBet(pot, stack, 0, rng);
    if (s > 0.4 && rng() < 0.3) return valueBet(pot, stack, 0, rng);
    return { action: "check" };
  }

  // Frente a apuesta: compara fuerza con precio (pot odds implícitos).
  const price = call / (pot + call);
  if (s < 0.25 && s < price) return { action: "fold" };
  if (s > 0.8) return valueBet(pot, stack, call, rng); // raise 50-75% pot
  return { action: "call", amount: Math.min(call, stack) };
}
