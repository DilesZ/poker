// Tests de equity Monte Carlo (vitest).
import { describe, expect, it } from "vitest";
import { calcEquity, countOuts, equityRegla24 } from "./equity";
import type { Card, Rank, Suit } from "./types";

const C = (rank: Rank, suit: Suit): Card => ({ rank, suit });

/** RNG determinista (mulberry32) para tests estables. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("equity", () => {
  it("1. AA preflop > 70% vs 1 opp (seed fijo)", () => {
    const hole = [C(14, "♠"), C(14, "♥")];
    const eq = calcEquity(hole, [], 1, 1000, seeded(42));
    expect(eq).toBeGreaterThan(0.7);
    expect(eq).toBeLessThanOrEqual(1);
  });

  it("2. proyecto color en flop ~35-45% vs 1 opp", () => {
    // 7♥ 6♥ en A♥ K♥ 2♣: color bajo a una carta, sin pareja ni overcards.
    // La regla 2-4 predice 9×4 ≈ 36% para LIGAR; vs rango aleatorio la
    // equity realizada es algo mayor (~47%) porque a veces gana sin ligar.
    const hole = [C(7, "♥"), C(6, "♥")];
    const board = [C(14, "♥"), C(13, "♥"), C(2, "♣")];
    const eq = calcEquity(hole, board, 1, 2000, seeded(7));
    expect(eq).toBeGreaterThan(0.35);
    expect(eq).toBeLessThan(0.55);
    expect(Math.abs(eq - equityRegla24(9, "flop"))).toBeLessThan(0.15);
  });

  it("3. board completo unbeatable → split 50/50 determinista", () => {
    // Escalera real en mesa: nadie puede superarla → siempre empate.
    const board = [C(10, "♥"), C(11, "♥"), C(12, "♥"), C(13, "♥"), C(14, "♥")];
    const hero = [C(2, "♣"), C(3, "♦")];
    const eq = calcEquity(hero, board, 1, 200, seeded(1));
    expect(eq).toBeCloseTo(0.5, 10);
  });

  it("4. equity siempre entre 0 y 1", () => {
    const eq = calcEquity([C(13, "♠"), C(7, "♦")], [C(2, "♣"), C(9, "♥"), C(5, "♠")], 2, 300, seeded(99));
    expect(eq).toBeGreaterThanOrEqual(0);
    expect(eq).toBeLessThanOrEqual(1);
    const eqRiver = calcEquity(
      [C(14, "♠"), C(13, "♠")],
      [C(2, "♣"), C(5, "♦"), C(9, "♥"), C(11, "♣"), C(4, "♠")],
      3,
      200,
      seeded(5),
    );
    expect(eqRiver).toBeGreaterThanOrEqual(0);
    expect(eqRiver).toBeLessThanOrEqual(1);
  });

  it("5. no muta hole ni board", () => {
    const hole = [C(14, "♠"), C(13, "♠")];
    const board = [C(2, "♥"), C(7, "♥"), C(11, "♣")];
    const holeSnap = JSON.stringify(hole);
    const boardSnap = JSON.stringify(board);
    calcEquity(hole, board, 1, 200, seeded(3));
    expect(JSON.stringify(hole)).toBe(holeSnap);
    expect(JSON.stringify(board)).toBe(boardSnap);
  });

  it("6. countOuts detecta proyecto color (9 outs)", () => {
    const hole = [C(7, "♥"), C(6, "♥")];
    const board = [C(14, "♥"), C(13, "♥"), C(2, "♣")];
    expect(countOuts(hole, board)).toBeGreaterThanOrEqual(9);
  });

  it("7. regla 2-4: 9 outs en flop ≈ 36%", () => {
    expect(equityRegla24(9, "flop")).toBeCloseTo(0.36, 10);
    expect(equityRegla24(9, "turn")).toBeCloseTo(0.18, 10);
    expect(equityRegla24(9, "river")).toBe(0);
  });
});
