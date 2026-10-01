// Motor Texas Hold'em puro — tipos base. Sin React, sin dependencias.

/** Palo francés. */
export type Suit = "♠" | "♥" | "♦" | "♣";

/** Rango numérico: 2-10, 11=J, 12=Q, 13=K, 14=A. */
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

/** Carta: rango + palo. */
export interface Card {
  rank: Rank;
  suit: Suit;
}

/** Calles del juego. */
export type Street = "preflop" | "flop" | "turn" | "river" | "showdown" | "done";

/** Estado de un jugador en la mano actual. */
export interface PlayerState {
  id: number;
  name: string;
  /** Fichas disponibles (sin contar lo apostado). */
  stack: number;
  /** Total comprometido en esta mano (para side pots). */
  bet: number;
  folded: boolean;
  allIn: boolean;
  /** 2 cartas propias (vacío si aún sin repartir). */
  hole: Card[];
  isHero: boolean;
}

/** Bote lateral: cantidad y jugadores con derecho (ids). */
export interface SidePot {
  amount: number;
  eligible: number[];
}

/** Estado completo de la mano. */
export interface GameState {
  players: PlayerState[];
  /** Índice del botón (dealer). */
  button: number;
  smallBlind: number;
  bigBlind: number;
  street: Street;
  /** Cartas comunitarias (0-5). */
  board: Card[];
  /** Mazo restante (boca abajo). */
  deck: Card[];
  /** Bote total (= suma de sidePots, caché). */
  pot: number;
  sidePots: SidePot[];
  /** Apuesta máxima a igualar en la calle actual. */
  currentBet: number;
  /** Ganadores tras showdown (ids). */
  winners?: number[];
}
