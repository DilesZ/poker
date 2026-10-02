// Tests de la liga on-policy: determinismo, cero-sum, conteo de manos,
// multi-reflect por mano y no-mutación de la entrada.
import { describe, expect, it } from "vitest";
import { createBrain } from "./brain";
import { jugarLiga } from "./liga";

describe("agent/liga", () => {
  it("1. determinista con mismo seed", () => {
    const a = jugarLiga(createBrain(), { hands: 20, seed: 7 });
    const b = jugarLiga(createBrain(), { hands: 20, seed: 7 });
    expect(a.brain.priors).toEqual(b.brain.priors);
    expect(a.stats).toEqual(b.stats);
    expect(a.brain.handsPlayed).toBe(20);
  });

  it("2. cero-sum: la suma de bb de los 6 ≈ 0 (conserva fichas)", () => {
    const r = jugarLiga(createBrain(), { hands: 50, seed: 42 });
    // Solo se tolera la micro-pérdida de ciegas huérfanas (BB foldea: -10).
    expect(Math.abs(r.stats.sumaBB)).toBeLessThan(50);
  });

  it("3. 6 reflects por mano y 1 mano contada (sin inflar)", () => {
    const r = jugarLiga(createBrain(), { hands: 30, seed: 7, dreamCada: 0 });
    expect(r.stats.reflects).toBe(180);
    expect(r.brain.handsPlayed).toBe(30);
    // Epsilon decayó 30 veces (0.9*0.98^30≈0.49), no 180 (0.9*0.98^180≈0.02):
    // con 6 reflects por mano sigue explorando.
    expect(r.brain.epsilon).toBeCloseTo(0.9 * Math.pow(0.98, 30), 3);
  });

  it("4. no muta el brain de entrada y mueve priors", () => {
    const base = createBrain();
    const antes = JSON.stringify(base.priors);
    const r = jugarLiga(base, { hands: 20, seed: 7, dreamCada: 0 });
    expect(JSON.stringify(base.priors)).toBe(antes);
    expect(base.handsPlayed).toBe(0);
    expect(r.stats.priorsMovidos).toBeGreaterThan(0);
    expect(r.stats.hands).toBe(20);
    expect(r.stats.showdownPct).toBeGreaterThanOrEqual(0);
    expect(r.stats.showdownPct).toBeLessThanOrEqual(1);
  });

  it("5. 200 manos en tiempo razonable", () => {
    const t0 = Date.now();
    const r = jugarLiga(createBrain(), { hands: 200, seed: 99, dreamCada: 0 });
    expect(r.stats.hands).toBe(200);
    expect(Date.now() - t0).toBeLessThan(30000);
  }, 40000);
});
