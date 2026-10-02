// Tests de memoria global (5): roundtrip, merge, cap, SSR-safe, corrupt→default.
import { beforeEach, describe, expect, it } from "vitest";
import { createBrain } from "./brain";
import {
  GLOBAL_KEY,
  __clearGlobalCache,
  loadGlobalBrain,
  mergeBrains,
  migrateBrain,
  saveGlobalBrain,
} from "./memory";

function stubStorage(): Map<string, string> {
  const m = new Map<string, string>();
  const fake = {
    getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k: string, v: string) => {
      m.set(k, v);
    },
    removeItem: (k: string) => {
      m.delete(k);
    },
  };
  (globalThis as unknown as Record<string, unknown>)["localStorage"] = fake;
  return m;
}

beforeEach(() => {
  __clearGlobalCache();
  stubStorage();
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

  it("SSR-safe: no lanza sin almacenamiento", () => {
    __clearGlobalCache();
    delete (globalThis as unknown as Record<string, unknown>)["localStorage"];
    let resultado: unknown;
    expect(() => {
      resultado = loadGlobalBrain();
    }).not.toThrow();
    expect(resultado === null || typeof resultado === "object").toBe(true);
    expect(() => saveGlobalBrain(createBrain())).not.toThrow();
    stubStorage();
  });

  it("corrupt→default: JSON roto o sin priors devuelve cerebro base", () => {
    const store = stubStorage();
    store.set(GLOBAL_KEY, "%%%no-json%%%");
    __clearGlobalCache();
    const cargado = loadGlobalBrain();
    expect(cargado).not.toBeNull();
    expect(cargado?.handsPlayed).toBe(0);
    expect(cargado?.priors["flop/hasPot/call"]).toBe(0.5);
    // migrate directo con basura también da base
    expect(migrateBrain(null).handsPlayed).toBe(0);
    expect(migrateBrain({ hola: 1 }).priors["flop/hasPot/call"]).toBe(0.5);
  });
});
