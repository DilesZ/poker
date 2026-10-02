// lib/cfr/cfrplus.test.ts — Validación comparativa CFR+ vs CFR vanilla (P5).
// Gate de honestidad del spec P5 (specs/cfr-plus/spec.md): a igual nº de
// iteraciones y seed, cfr+ debe medir exploitability menor o igual que cfr
// en Kuhn y Leduc. No pisa lib/cfr/plus.test.ts (primitivas del otro agente).
import { describe, expect, it } from "vitest";
import { exploitability } from "./exploit";
import { strategyMap, trainCFR } from "./trainer";
import type { CFRGame } from "./game";
import { kuhnGame } from "../games/kuhn";
import { leducGame } from "../games/leduc";

/** Exploitabilidad de la estrategia media tras entrenar con `algorithm`. */
function exploitTras(
  juego: CFRGame,
  iterations: number,
  seed: number,
  algorithm: "cfr" | "cfr+",
): number {
  const resultado = trainCFR({ game: juego, iterations, seed, algorithm });
  return exploitability(juego, strategyMap(resultado));
}

describe("cfr+/validación comparativa", () => {
  it("1. Kuhn N=2000 misma seed: expl(cfr+) <= expl(cfr)", () => {
    const explCfr = exploitTras(kuhnGame, 2000, 12345, "cfr");
    const explPlus = exploitTras(kuhnGame, 2000, 12345, "cfr+");
    expect(explCfr).toBeGreaterThanOrEqual(0);
    expect(explPlus).toBeGreaterThanOrEqual(0);
    expect(explPlus).toBeLessThanOrEqual(explCfr);
  }, 120000);

  it("2. Leduc N=800 misma seed: expl(cfr+) <= expl(cfr)", () => {
    const explCfr = exploitTras(leducGame, 800, 7, "cfr");
    const explPlus = exploitTras(leducGame, 800, 7, "cfr+");
    expect(explCfr).toBeGreaterThanOrEqual(0);
    expect(explPlus).toBeGreaterThanOrEqual(0);
    expect(explPlus).toBeLessThanOrEqual(explCfr);
  }, 180000);

  it("3. Kuhn cfr+ 2000 iters: expl < 0.03 y algorithm = cfr+", () => {
    const resultado = trainCFR({ game: kuhnGame, iterations: 2000, seed: 12345, algorithm: "cfr+" });
    expect(resultado.algorithm).toBe("cfr+");
    const expl = exploitability(kuhnGame, strategyMap(resultado));
    expect(expl).toBeGreaterThanOrEqual(0);
    expect(expl).toBeLessThan(0.03);
  }, 120000);
});
