// Baraja estándar de 52 cartas. Sin dependencias.
import type { Card, Rank, Suit } from "./types";

const SUITS: Suit[] = ["♠", "♥", "♦", "♣"];
const RANKS: Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

/** Crea baraja ordenada de 52 cartas. */
export function newDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

/** Baraja in-place con Fisher-Yates. Acepta RNG inyectable (tests). */
export function shuffle<T>(deck: T[], rng: () => number = Math.random): T[] {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j] as T, deck[i] as T];
  }
  return deck;
}

/** Roba 1 carta del mazo (del final). undefined si vacío. */
export function draw(deck: Card[]): Card | undefined {
  return deck.pop();
}

/** Roba n cartas (menos si no quedan). */
export function drawMany(deck: Card[], n: number): Card[] {
  const out: Card[] = [];
  for (let i = 0; i < n; i++) {
    const c = deck.pop();
    if (!c) break;
    out.push(c);
  }
  return out;
}
