// Tests de memoria de proceso (5): roundtrip, merge, cap, seguro-sin-entorno, corrupto→base.
import { beforeEach, describe, expect, it } from "vitest";
import { createBrain } from "./brain";
import {
  __clearGlobalCache,
  loadGlobalBrain,
  mergeBrains,
  migrateBrain,
  saveGlobalBrain,
} from "./memory";

beforeEach(() => {
  __clearGlobalCache();
});

describe("memory", () => {
  it("roundtrip: guarda y carga el mismo cerebro", () => {
    const b = createBrain();
    b.handsPlayed = 5;
    b.priors["flop/hasPot/call"] = 0.7;
    saveGlobalBrain(b);
    const cargado = loadGlobalBrain();
    expect(cargado).not.toBeNull();
    expect(cargado?.handsPlayed).toBe(5);
    expect(cargado?.priors["flop/hasPot/call"]).toBeCloseTo(0.7, 6);
  });

  it("merge promedia priors donde ambos difieren", () => {
    const g = createBrain();
    const r = createBrain();
    g.handsPlayed = 10;
    r.handsPlayed = 10;
    g.priors["flop/hasPot/call"] = 0.6;
    r.priors["flop/hasPot/call"] = 0.8;
    const m = mergeBrains(g, r);
    expect(m.priors["flop/hasPot/call"]).toBeCloseTo(0.7, 6);
    expect(m.handsPlayed).toBe(20);
    expect(m.epsilon).toBe(Math.min(g.epsilon, r.epsilon));
  });

  it("capa priors a 500 claves (LRU: borra las cercanas a 0.5)", () => {
    const b = createBrain();
    for (let i = 0; i < 600; i++) {
      b.priors[`extra/${i}/call`] = 0.9;
    }
    saveGlobalBrain(b);
    const cargado = loadGlobalBrain();
    expect(cargado).not.toBeNull();
    expect(Object.keys(cargado?.priors ?? {}).length).toBeLessThanOrEqual(500);
  });

  it("seguro sin entorno: no lanza y devuelve nulo o cerebro", () => {
    __clearGlobalCache();
    let resultado: unknown;
    expect(() => {
      resultado = loadGlobalBrain();
    }).not.toThrow();
    expect(resultado === null || typeof resultado === "object").toBe(true);
    expect(() => saveGlobalBrain(createBrain())).not.toThrow();
  });

  it("corrupto→base: basura o sin priors devuelve cerebro base", () => {
    __clearGlobalCache();
    const cargado = loadGlobalBrain();
    expect(cargado).toBeNull();
    expect(migrateBrain(null).handsPlayed).toBe(0);
    expect(migrateBrain({ hola: 1 }).priors["flop/hasPot/call"]).toBe(0.5);
    expect(migrateBrain("%%%no-json%%%").handsPlayed).toBe(0);
  });
});
