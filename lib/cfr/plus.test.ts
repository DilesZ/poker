// Tests de CFR+ (vitest, cero deps salvo vitest).
import { describe, expect, it } from "vitest";
import { kuhnGame } from "../games/kuhn";
import { newNode } from "./node";
import { applyRegretPlusUpdate, linearWeight } from "./plus";
import { strategyMap, trainCFR } from "./trainer";

function suma(valores: number[]): number {
  return valores.reduce((acum, v) => acum + v, 0);
}

describe("cfr plus", () => {
  it("trunca los negativos a cero ([1,-2] + [0.5,-0.5] → [1.5,0])", () => {
    const nodo = newNode(["a", "b"]);
    nodo.regretSum = [1, -2];
    applyRegretPlusUpdate(nodo, [0.5, -0.5]);
    expect(nodo.regretSum).toEqual([1.5, 0]);
    expect(nodo.actions).toEqual(["a", "b"]);
  });

  it("conserva los positivos sin truncar", () => {
    const nodo = newNode(["a", "b"]);
    nodo.regretSum = [2, 3];
    applyRegretPlusUpdate(nodo, [1, 1]);
    expect(nodo.regretSum).toEqual([3, 4]);
  });

  it("lanza si las longitudes difieren", () => {
    const nodo = newNode(["a", "b"]);
    expect(() => applyRegretPlusUpdate(nodo, [0.5])).toThrow();
    expect(() => applyRegretPlusUpdate(nodo, [0.5, 0.5, 0.5])).toThrow();
  });

  it("linearWeight(1)=1, (5)=5 y lanza si t<1", () => {
    expect(linearWeight(1)).toBe(1);
    expect(linearWeight(5)).toBe(5);
    expect(() => linearWeight(0)).toThrow();
    expect(() => linearWeight(-3)).toThrow();
    expect(() => linearWeight(0.5)).toThrow();
  });

  it("integración: 10 iters cfr+ en Kuhn dan estrategias válidas y deterministas", () => {
    const a = trainCFR({ game: kuhnGame, iterations: 10, seed: 42, algorithm: "cfr+" });
    expect(a.algorithm).toBe("cfr+");
    expect(a.seed).toBe(42);
    expect(a.iterations).toBe(10);
    const mapa = strategyMap(a);
    expect(mapa.size).toBeGreaterThan(0);
    for (const { actions, probs } of mapa.values()) {
      expect(probs).toHaveLength(actions.length);
      expect(suma(probs)).toBeCloseTo(1);
      for (const p of probs) {
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);
      }
    }
    const b = trainCFR({ game: kuhnGame, iterations: 10, seed: 42, algorithm: "cfr+" });
    const claves = [...a.nodes.keys()].sort();
    expect(claves.length).toBeGreaterThan(0);
    expect(claves).toEqual([...b.nodes.keys()].sort());
    for (const clave of claves) {
      expect(a.nodes.get(clave)?.strategySum).toEqual(b.nodes.get(clave)?.strategySum);
      expect(a.nodes.get(clave)?.regretSum).toEqual(b.nodes.get(clave)?.regretSum);
    }
  });
});
