// Tests training v0.2-v2 (vitest): aprendizaje x10 (6 updates/mano + thresholds + sizing).
// v1 hacía 1 update/mano (solo héroe, LR 0.05). v2 hace 6/mano (todos los jugadores,
// LR_BASE 0.08 / LR_BIGPOT 0.12) + thresholds por posición + sizing del ganador.
// Por eso los pesos se mueven ~6x más rápido y la estrategia converge antes.
import { describe, expect, it } from "vitest";
import { DEFAULT_STRATEGY, cloneStrategy } from "./strategy";
import {
  SELFPLAY_LR,
  SELFPLAY_LR_V2,
  decideWithStrategy,
  pickSizingFraction,
  runSelfPlay,
} from "./selfplay";
import { LR_BASE, LR_BIGPOT } from "./strategy";

function countChanged(a: number[], b: number[], eps = 1e-12): number {
  let n = 0;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (Math.abs((a[i] ?? 0.5) - (b[i] ?? 0.5)) > eps) n++;
  }
  return n;
}

describe("training/selfplay v2", () => {
  it("1. 6 updates por mano: se mueven más índices que manos (no solo héroe)", () => {
    const init = cloneStrategy(DEFAULT_STRATEGY);
    const N = 30;
    const r = runSelfPlay(N, 42, cloneStrategy(DEFAULT_STRATEGY));
    const changed = countChanged(init.rangeWeights, r.updatedStrategy.rangeWeights);
    // v1 tocaba como máximo N índices (1/mano, solo héroe). v2 toca hasta 6*N.
    // Con 30 manos y 180 muestras sobre 169 clases, changed >> 30 de forma robusta.
    expect(r.hands).toBe(N);
    expect(changed).toBeGreaterThan(N);
  });

  it("2. thresholds se mueven con win/loss y momentumTracked, clip 0.3-0.75", () => {
    const init = cloneStrategy(DEFAULT_STRATEGY);
    const r = runSelfPlay(50, 7, cloneStrategy(DEFAULT_STRATEGY));
    const thr = r.updatedStrategy.pushFoldThresholds;
    const mom = r.updatedStrategy.thresholdMomentum;
    expect(mom).toBeDefined();
    // Al menos una posición se movió (gana→afloja thr baja, pierde→aprieta thr sube).
    let moved = 0;
    for (const pos of ["BTN", "SB", "BB", "EP", "MP", "CO"] as const) {
      expect(thr[pos]).toBeGreaterThanOrEqual(0.3);
      expect(thr[pos]).toBeLessThanOrEqual(0.75);
      if (Math.abs((thr[pos] ?? 0) - (init.pushFoldThresholds[pos] ?? 0)) > 1e-12) moved++;
      expect(Number.isFinite(mom?.[pos] ?? NaN)).toBe(true);
    }
    expect(moved).toBeGreaterThan(0);
    // Momentum acumulado no trivial tras 50 manos (alguna posición con |mom|>0).
    const anyMom = (Object.values(mom ?? {}) as number[]).some((v) => Math.abs(v) > 1e-12);
    expect(anyMom).toBe(true);
  });

  it("3. sizingWeights renormalizan a suma 1", () => {
    const r = runSelfPlay(100, 123, cloneStrategy(DEFAULT_STRATEGY));
    const sw = r.updatedStrategy.sizingWeights;
    const sum = (sw["33"] ?? 0) + (sw["50"] ?? 0) + (sw["75"] ?? 0);
    expect(sum).toBeCloseTo(1, 9);
    expect(sw["33"]).toBeGreaterThanOrEqual(0);
    expect(sw["50"]).toBeGreaterThanOrEqual(0);
    expect(sw["75"]).toBeGreaterThanOrEqual(0);
    expect(sw["33"]).toBeLessThanOrEqual(1);
    expect(sw["50"]).toBeLessThanOrEqual(1);
    expect(sw["75"]).toBeLessThanOrEqual(1);
    // Constantes v2 coherentes: LR_BASE 0.08, BIGPOT 0.12, legacy 0.05 intacto.
    expect(SELFPLAY_LR).toBe(0.05);
    expect(SELFPLAY_LR_V2).toBe(0.08);
    expect(LR_BASE).toBe(0.08);
    expect(LR_BIGPOT).toBe(0.12);
    // pickSizingFraction determinista con rng inyectable.
    const s = cloneStrategy(DEFAULT_STRATEGY);
    const f1 = pickSizingFraction(s, () => 0.0);
    const f2 = pickSizingFraction(s, () => 0.0);
    expect(f1).toBe(f2);
    expect([0.33, 0.5, 0.75]).toContain(f1);
    // decideWithStrategy mantiene firma (push/fold por umbral sigue igual).
    const loose = cloneStrategy(DEFAULT_STRATEGY);
    loose.pushFoldThresholds.BTN = 0.05;
    const pushFree = decideWithStrategy(0.6, 0, 100, 100, 20, "BTN", loose);
    expect(pushFree.action).toBe("all-in");
  });

  it("4. determinismo con seed: misma seed → mismo resultado", () => {
    const a = runSelfPlay(20, 999, cloneStrategy(DEFAULT_STRATEGY));
    const b = runSelfPlay(20, 999, cloneStrategy(DEFAULT_STRATEGY));
    expect(a.winrateBB100).toBe(b.winrateBB100);
    expect(a.showdownPct).toBe(b.showdownPct);
    expect(a.byPosition).toEqual(b.byPosition);
    expect(a.experiences).toEqual(b.experiences);
    expect(a.updatedStrategy.rangeWeights).toEqual(b.updatedStrategy.rangeWeights);
    expect(a.updatedStrategy.pushFoldThresholds).toEqual(b.updatedStrategy.pushFoldThresholds);
    expect(a.updatedStrategy.sizingWeights).toEqual(b.updatedStrategy.sizingWeights);
  });

  it("5. 1000 manos <5s", () => {
    const t0 = Date.now();
    const r = runSelfPlay(1000, 99, cloneStrategy(DEFAULT_STRATEGY));
    const ms = Date.now() - t0;
    expect(r.hands).toBe(1000);
    expect(r.experiences).toHaveLength(1000);
    expect(Number.isFinite(r.winrateBB100)).toBe(true);
    expect(ms).toBeLessThan(5000);
  });
});
