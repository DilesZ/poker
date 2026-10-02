// Tests de medición real del cerebro (council P0): traza real, determinismo y stats.
import { describe, expect, it } from "vitest";
import { createBrain } from "./brain";
import { runBrainEval } from "./evaluate";
import { cloneStrategy, DEFAULT_STRATEGY } from "../training/strategy";
import { runSelfPlay } from "../training/selfplay";
import { manoAHandRecord } from "./trainer";

describe("agent/evaluate", () => {
  it("1. traza real presente con cartas variadas (no siempre AKs)", () => {
    const r = runSelfPlay(50, 42, cloneStrategy(DEFAULT_STRATEGY));
    expect(r.experiences).toHaveLength(50);
    for (const exp of r.experiences) {
      expect(exp.heroTrace).toBeDefined();
      expect(typeof exp.heroTrace?.hole).toBe("string");
      expect(exp.heroTrace?.hole.length).toBeGreaterThan(0);
      expect(typeof exp.heroTrace?.board).toBe("string");
      expect(["preflop", "flop", "turn", "river"]).toContain(exp.heroTrace?.street);
      expect(Array.isArray(exp.heroTrace?.actions)).toBe(true);
      expect(exp.heroTrace?.numRivales).toBe(5);
      for (const a of exp.heroTrace?.actions ?? []) {
        expect(["fold", "check", "call", "raise", "allin"]).toContain(a.type);
      }
    }
    const holes = new Set(r.experiences.map((e) => e.heroTrace?.hole));
    expect(holes.size).toBeGreaterThan(1);
    expect(r.experiences.some((e) => e.heroTrace?.hole !== "A♠ K♠")).toBe(true);
    // manoAHandRecord usa la traza real (no el AKs sintético).
    const rec = manoAHandRecord(r.experiences[0]!, 0, false);
    expect(rec.myCards).toBe(r.experiences[0]?.heroTrace?.hole);
    expect(rec.board).toBe(r.experiences[0]?.heroTrace?.board);
  });

  it("2. determinista con mismo seed", () => {
    const a = runBrainEval(createBrain(), { hands: 100, seed: 7 });
    const b = runBrainEval(createBrain(), { hands: 100, seed: 7 });
    expect(a).toEqual(b);
    expect(a.hands).toBe(100);
  });

  it("3. 200 manos: stats finitas y brainDecisions>0", () => {
    const r = runBrainEval(createBrain(), { hands: 200, seed: 99 });
    expect(r.hands).toBe(200);
    expect(Number.isFinite(r.bb100)).toBe(true);
    expect(Number.isFinite(r.sd)).toBe(true);
    expect(Number.isFinite(r.ci95)).toBe(true);
    expect(r.sd).toBeGreaterThanOrEqual(0);
    expect(r.ci95).toBeGreaterThanOrEqual(0);
    expect(r.showdownPct).toBeGreaterThanOrEqual(0);
    expect(r.showdownPct).toBeLessThanOrEqual(1);
    expect(r.brainDecisions).toBeGreaterThan(0);
    for (const v of Object.values(r.byPosition)) expect(Number.isFinite(v)).toBe(true);
  }, 20000);

  it("4. mesa tight foldea más (menos showdown que mixto)", () => {
    const mixto = runBrainEval(createBrain(), { hands: 200, seed: 99 });
    const tight = runBrainEval(createBrain(), { hands: 200, seed: 99, field: "tight" });
    expect(tight.hands).toBe(200);
    expect(Number.isFinite(tight.bb100)).toBe(true);
    // Rivales que foldean lo débil ante presión → menos showdowns.
    // (Las manos duran más calles, así que el héroe decide igual o más veces.)
    expect(tight.showdownPct).toBeLessThan(mixto.showdownPct);
    expect(tight.brainDecisions).toBeGreaterThan(0);
  }, 20000);
});
