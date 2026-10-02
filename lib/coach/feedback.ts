// Coach: compara equity con pot odds y recomienda CALL / FOLD / FREE.
import { potOdds } from "../poker/game";
import type { Street } from "../poker/types";

export interface FeedbackInput {
  street: Street;
  pot: number;
  /** Fichas por igualar. 0 = pasar gratis. */
  toCall: number;
  /** Equity del héroe 0-1 (Monte Carlo o regla 2-4). */
  equity: number;
  /** Acción que planea el héroe (informativo). */
  action?: string;
}

/**
 * Consejo +EV: CALL si equity > pot odds, FOLD si no, FREE si no hay que igualar.
 * Devuelve texto con el veredicto al inicio (buscable: "CALL"/"FOLD"/"FREE").
 */
export function buildFeedback({ street, pot, toCall, equity, action }: FeedbackInput): string {
  const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;
  if (toCall <= 0) {
    return `FREE — pasar es gratis en ${street}. Equity ${pct(equity)}. Pasa y ve la siguiente carta.`;
  }
  const price = potOdds(toCall, pot);
  const plan = action ? ` Tu plan: ${action}.` : "";
  if (equity > price) {
    return `CALL +EV — equity ${pct(equity)} > precio ${pct(price)} (igualar ${toCall} en bote ${pot}, ${street}).${plan}`;
  }
  return `FOLD — equity ${pct(equity)} < precio ${pct(price)} (igualar ${toCall} en bote ${pot}, ${street}). No es rentable.${plan}`;
}
