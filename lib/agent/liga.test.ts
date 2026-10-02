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
    const r = jugarLiga(createBrain(), { hands: 30, seed: 7, dreamCada: 0, replay: false });
    expect(r.stats.reflects).toBe(180);
    expect(r.brain.handsPlayed).toBe(30);
    // Epsilon decayó 30 veces a tasa liga 0.995 (0.9*0.995^30≈0.775), no 180
    // veces (0.9*0.98^180≈0.02): con 6 reflects por mano sigue explorando.
    expect(r.brain.epsilon).toBeCloseTo(0.9 * Math.pow(0.995, 30), 3);
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

  it("6. replay suma 8 reflects por bloque de 25 (y se puede apagar)", () => {
    const con = jugarLiga(createBrain(), { hands: 100, seed: 7, dreamCada: 0 });
    // 100 manos × 6 + 4 bloques × 8 replay = 632.
    expect(con.stats.reflects).toBe(632);
    const sin = jugarLiga(createBrain(), { hands: 100, seed: 7, dreamCada: 0, replay: false });
    expect(sin.stats.reflects).toBe(600);
    expect(sin.brain.handsPlayed).toBe(100);
  });

  it("7. exploiter: asiento heurístico que no aprende (5 reflects/mano)", () => {
    const a = jugarLiga(createBrain(), { hands: 100, seed: 7, dreamCada: 0, exploiterSeat: 5 });
    // 100×5 + 32 replay = 532; la mano sigue contando 1.
    expect(a.stats.reflects).toBe(532);
    expect(a.brain.handsPlayed).toBe(100);
    expect(a.stats.asientosVivos).toBe(5);
    const b = jugarLiga(createBrain(), { hands: 100, seed: 7, dreamCada: 0, exploiterSeat: 5 });
    expect(a.brain.priors).toEqual(b.brain.priors);
    expect(Math.abs(a.stats.sumaBB)).toBeLessThan(50);
  });

  it("8. snapshot trailing: asientos 1 y 3 congelados (4 y 3 reflects/mano)", () => {
    const snap = jugarLiga(createBrain(), { hands: 100, seed: 7, dreamCada: 0, snapshotCada: 50 });
    // 100×4 + 32 replay = 432.
    expect(snap.stats.reflects).toBe(432);
    expect(snap.brain.handsPlayed).toBe(100);
    expect(snap.stats.asientosVivos).toBe(4);
    const ambos = jugarLiga(createBrain(), {
      hands: 100,
      seed: 7,
      dreamCada: 0,
      exploiterSeat: 5,
      snapshotCada: 50,
    });
    // Vivos 0,2,4 → 100×3 + 32 = 332.
    expect(ambos.stats.reflects).toBe(332);
    expect(ambos.stats.asientosVivos).toBe(3);
    const bis = jugarLiga(createBrain(), {
      hands: 100,
      seed: 7,
      dreamCada: 0,
      exploiterSeat: 5,
      snapshotCada: 50,
    });
    expect(ambos.brain.priors).toEqual(bis.brain.priors);
  });
});
