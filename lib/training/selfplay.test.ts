// Tests training v0.2 (vitest): determinismo, winrate finito y push/fold por umbral.
import { describe, expect, it } from "vitest";
import { DEFAULT_STRATEGY, cloneStrategy } from "./strategy";
import { decideWithStrategy, runSelfPlay } from "./selfplay";

describe("training/selfplay", () => {
  it("1. 10 manos con mismo seed dan el mismo resultado", () => {
    const a = runSelfPlay(10, 123, cloneStrategy(DEFAULT_STRATEGY));
    const b = runSelfPlay(10, 123, cloneStrategy(DEFAULT_STRATEGY));
    expect(a.hands).toBe(10);
    expect(b.hands).toBe(10);
    expect(a.winrateBB100).toBe(b.winrateBB100);
    expect(a.showdownPct).toBe(b.showdownPct);
    expect(a.byPosition).toEqual(b.byPosition);
    expect(a.experiences).toEqual(b.experiences);
  });

  it("2. winrate es un número finito", () => {
    const r = runSelfPlay(10, 7, cloneStrategy(DEFAULT_STRATEGY));
    expect(r.hands).toBe(10);
    expect(Number.isFinite(r.winrateBB100)).toBe(true);
    expect(Number.isFinite(r.showdownPct)).toBe(true);
    expect(r.showdownPct).toBeGreaterThanOrEqual(0);
    expect(r.showdownPct).toBeLessThanOrEqual(1);
    expect(r.experiences).toHaveLength(10);
  });

  it("3. push/fold <10bb usa el umbral de la estrategia", () => {
    // Stack 100 con bb 20 = 5bb → rama push/fold.
    const loose = cloneStrategy(DEFAULT_STRATEGY);
    loose.pushFoldThresholds.BTN = 0.05;
    const tight = cloneStrategy(DEFAULT_STRATEGY);
    tight.pushFoldThresholds.BTN = 0.95;

    // Gratis: fuerza 0.6 > 0.05 → push; 0.6 < 0.95 → check.
    const pushFree = decideWithStrategy(0.6, 0, 100, 100, 20, "BTN", loose);
    const checkFree = decideWithStrategy(0.6, 0, 100, 100, 20, "BTN", tight);
    expect(pushFree.action).toBe("all-in");
    expect(checkFree.action).toBe("check");

    // Frente a apuesta grande (40 > 10% de 100): 0.6 > 0.05 → push; 0.6 < 0.95 → fold.
    const pushVsBet = decideWithStrategy(0.6, 40, 100, 100, 20, "BTN", loose);
    const foldVsBet = decideWithStrategy(0.6, 40, 100, 100, 20, "BTN", tight);
    expect(pushVsBet.action).toBe("all-in");
    expect(foldVsBet.action).toBe("fold");
  });
});
