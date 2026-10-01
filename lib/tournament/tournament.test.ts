import { describe, expect, it } from "vitest";
import { LEVELS, levelForHand } from "./blinds";
import { PAYOUT_PCT, isBubble } from "./structure";

describe("tournament SNG", () => {
  it("el nivel sube cada 6 manos", () => {
    expect(levelForHand(0)).toBe(0);
    expect(levelForHand(5)).toBe(0);
    expect(levelForHand(6)).toBe(1);
    expect(levelForHand(11)).toBe(1);
    expect(levelForHand(12)).toBe(2);
  });

  it("ante es 0 en los niveles 1-3", () => {
    expect(LEVELS[0]?.ante).toBe(0);
    expect(LEVELS[1]?.ante).toBe(0);
    expect(LEVELS[2]?.ante).toBe(0);
    expect(LEVELS[3]?.ante).toBeGreaterThan(0);
  });

  it("los payouts suman 100", () => {
    const total = PAYOUT_PCT.reduce((s, p) => s + p, 0);
    expect(total).toBe(100);
  });

  it("hay burbuja con 3 vivos", () => {
    expect(isBubble(3)).toBe(true);
    expect(isBubble(4)).toBe(false);
    expect(isBubble(2)).toBe(false);
  });
});
