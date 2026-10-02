// Tests del entrenador CFR tabular (vitest, cero deps salvo vitest).
// Kuhn existe (lib/games/kuhn.ts), así que los tests entrenan sobre Kuhn
// y no necesitan ningún juego stub inline.
import { describe, expect, it } from "vitest";
import { kuhnGame } from "../games/kuhn";
import { averageStrategy, newNode } from "./node";
import { strategyMap, trainCFR } from "./trainer";

function suma(valores: number[]): number {
  return valores.reduce((acum, v) => acum + v, 0);
}

describe("trainer CFR", () => {
  it("0 iteraciones → estrategias uniformes (y rechaza iterations inválido)", () => {
    const res = trainCFR({ game: kuhnGame, iterations: 0, seed: 1 });
    expect(res.nodes.size).toBe(0);
    expect(strategyMap(res).size).toBe(0);
    expect(res.iterations).toBe(0);
    expect(res.seed).toBe(1);
    expect(res.gameName).toBe(kuhnGame.name);
    // Sin visitas, la estrategia media es uniforme (contrato de node.ts).
    expect(averageStrategy(newNode(["pass", "bet"]))).toEqual([0.5, 0.5]);
    expect(() => trainCFR({ game: kuhnGame, iterations: -1, seed: 1 })).toThrow();
    expect(() => trainCFR({ game: kuhnGame, iterations: 1.5, seed: 1 })).toThrow();
  });

  it("determinista con la misma seed (mismos strategySum y regretSum)", () => {
    const a = trainCFR({ game: kuhnGame, iterations: 50, seed: 7 });
    const b = trainCFR({ game: kuhnGame, iterations: 50, seed: 7 });
    const claves = [...a.nodes.keys()].sort();
    expect(claves.length).toBeGreaterThan(0);
    expect(claves).toEqual([...b.nodes.keys()].sort());
    for (const clave of claves) {
      expect(a.nodes.get(clave)?.strategySum).toEqual(b.nodes.get(clave)?.strategySum);
      expect(a.nodes.get(clave)?.regretSum).toEqual(b.nodes.get(clave)?.regretSum);
    }
  });

  it("strategySum del infoset inicial crece con alcance > 0 (≈ 2×iterations)", () => {
    const n = 10;
    const res = trainCFR({ game: kuhnGame, iterations: n, seed: 3 });
    const nodo = res.nodes.get("Kuhn:0:Q|");
    expect(nodo).toBeDefined();
    expect(nodo?.actions).toEqual(["pass", "bet"]);
    // Recorrido exacto: P0-con-Q se visita en 2 caminos (QJ y QK) con
    // alcance propio 1 en cada uno → +2 por iteración. No es un bug.
    expect(suma(nodo?.strategySum ?? [])).toBeCloseTo(2 * n);
  });

  it("aprende en Kuhn: medias válidas y con K ante bet paga", () => {
    const res = trainCFR({ game: kuhnGame, iterations: 300, seed: 5 });
    const mapa = strategyMap(res);
    expect(mapa.size).toBeGreaterThan(0);
    for (const { actions, probs } of mapa.values()) {
      expect(probs).toHaveLength(actions.length);
      expect(suma(probs)).toBeCloseTo(1);
      for (const p of probs) {
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);
      }
    }
    // Con K ante apuesta, igualar gana a casi todo: la media carga "call".
    // (El nodo P0-ante-bet es "Kuhn:0:K|pb": tras "b" le toca a P1, no a P0.)
    const k = mapa.get("Kuhn:0:K|pb");
    expect(k).toBeDefined();
    if (k === undefined) throw new Error("falta el infoset Kuhn:0:K|pb");
    expect(k.actions).toEqual(["fold", "call"]);
    expect(k.probs[k.actions.indexOf("call")]).toBeGreaterThan(0.7);
  });
});
