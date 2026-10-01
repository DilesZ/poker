// Tests del evaluador (vitest). 8 casos: jerarquía, kicker, split y As-bajo.
import { describe, expect, it } from "vitest";
import { compareRanks, evaluate5, evaluate7 } from "./evaluator";
import type { Card, Rank, Suit } from "./types";

// Helper: carta rápida C(14,'♠') = A♠.
const C = (rank: Rank, suit: Suit): Card => ({ rank, suit });

describe("evaluator", () => {
  it("1. trío gana a par", () => {
    const trips = evaluate5([C(9, "♠"), C(9, "♥"), C(9, "♦"), C(4, "♣"), C(2, "♠")]);
    const pair = evaluate5([C(14, "♠"), C(14, "♥"), C(13, "♦"), C(12, "♣"), C(11, "♠")]);
    expect(trips.category).toBe(3);
    expect(pair.category).toBe(1);
    expect(compareRanks(trips, pair)).toBeGreaterThan(0);
  });

  it("2. full gana a flush", () => {
    const full = evaluate5([C(13, "♠"), C(13, "♥"), C(13, "♦"), C(4, "♣"), C(4, "♠")]);
    const flush = evaluate5([C(14, "♥"), C(11, "♥"), C(9, "♥"), C(6, "♥"), C(3, "♥")]);
    expect(full.category).toBe(6);
    expect(flush.category).toBe(5);
    expect(compareRanks(full, flush)).toBeGreaterThan(0);
  });

  it("3. split pot con la misma escalera en mesa", () => {
    // Mesa: 5-6-7-8-9. Ambos juegan la mesa -> empate.
    const board = [C(5, "♠"), C(6, "♥"), C(7, "♦"), C(8, "♣"), C(9, "♠")];
    const hero = evaluate7([...board, C(14, "♥"), C(14, "♦")]);
    const villain = evaluate7([...board, C(2, "♥"), C(3, "♦")]);
    expect(hero.category).toBe(4);
    expect(compareRanks(hero, villain)).toBe(0);
  });

  it("4. kicker decide con el mismo par", () => {
    // Par de Ases en mesa implícito: A-A-x + K gana a A-A-x + Q.
    const ak = evaluate5([C(14, "♠"), C(14, "♥"), C(13, "♦"), C(9, "♣"), C(5, "♠")]);
    const aq = evaluate5([C(14, "♣"), C(14, "♦"), C(12, "♥"), C(9, "♠"), C(5, "♥")]);
    expect(compareRanks(ak, aq)).toBeGreaterThan(0);
  });

  it("5. As-bajo (wheel A-2-3-4-5) es escalera con alto 5", () => {
    const wheel = evaluate5([C(14, "♠"), C(2, "♥"), C(3, "♦"), C(4, "♣"), C(5, "♠")]);
    expect(wheel.category).toBe(4);
    expect(wheel.tiebreak).toEqual([5]);
    const sixHigh = evaluate5([C(2, "♠"), C(3, "♥"), C(4, "♦"), C(5, "♣"), C(6, "♠")]);
    expect(compareRanks(sixHigh, wheel)).toBeGreaterThan(0);
  });

  it("6. escalera de color gana a poker", () => {
    const sf = evaluate5([C(5, "♥"), C(6, "♥"), C(7, "♥"), C(8, "♥"), C(9, "♥")]);
    const quads = evaluate5([C(14, "♠"), C(14, "♥"), C(14, "♦"), C(14, "♣"), C(2, "♠")]);
    expect(sf.category).toBe(8);
    expect(compareRanks(sf, quads)).toBeGreaterThan(0);
  });

  it("7. poker gana a full (evaluate7)", () => {
    const board = [C(13, "♠"), C(13, "♥"), C(10, "♦"), C(10, "♣"), C(2, "♠")];
    const quads = evaluate7([...board, C(13, "♦"), C(13, "♣")]);
    const full = evaluate7([...board, C(10, "♥"), C(10, "♠")]);
    expect(quads.category).toBe(7);
    expect(compareRanks(quads, full)).toBeGreaterThan(0);
  });

  it("8. carta alta: A-high gana a K-high, mismo kicker empata", () => {
    const aHigh = evaluate5([C(14, "♠"), C(10, "♥"), C(8, "♦"), C(6, "♣"), C(3, "♠")]);
    const kHigh = evaluate5([C(13, "♠"), C(10, "♥"), C(8, "♦"), C(6, "♣"), C(3, "♥")]);
    expect(compareRanks(aHigh, kHigh)).toBeGreaterThan(0);
    const aHigh2 = evaluate5([C(14, "♥"), C(10, "♣"), C(8, "♣"), C(6, "♥"), C(3, "♦")]);
    expect(compareRanks(aHigh, aHigh2)).toBe(0);
  });
});
