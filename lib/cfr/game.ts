// Contrato mínimo de juego en forma extensiva para CFR (TypeScript puro,
// cero dependencias). Lo implementan los juegos (p. ej. Kuhn) y lo consumen
// el entrenador y el cálculo de exploitability de otros agentes.
// Los estados son inmutables: apply() devuelve un estado nuevo sin mutar.
export const CHANCE = -1;
export type CFRPlayer = 0 | 1;
export interface CFRState {
  readonly isTerminal: boolean;
  readonly turn: CFRPlayer | typeof CHANCE;
  legalActions(): string[];
  infosetKey(player: CFRPlayer): string;
  chanceOutcomes(): Array<{ action: string; prob: number }>;
  apply(action: string): CFRState; // inmutable
  utility(player: CFRPlayer): number; // solo si terminal; zero-sum (u1 = -u0)
}
export interface CFRGame {
  readonly name: string;
  newInitial(): CFRState;
}
