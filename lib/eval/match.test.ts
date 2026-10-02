// Tests del evaluador heads-up (vitest). 6 casos: determinismo, conservación,
// alternancia, stats sanas, rangos e IC95%. Cero deps, sin `Math.random`.
import { describe, expect, it } from "vitest";
import type { BaselineAgent } from "@/lib/baselines/agent";
import { _matchInterno, asientosDeLaMano, playMatch } from "./match";

/** Station de prueba: nunca foldea; iguala con apuesta y pasa si es gratis. */
const station: BaselineAgent = {
  id: "calling-station",
  name: "Station de prueba",
  version: "test-0",
  decide: (info) => {
    if (info.legal.canCall) return { type: "call" };
    if (info.legal.canCheck) return { type: "check" };
    if (info.legal.canAllIn) return { type: "allin" };
    return { type: "fold" };
  },
};

/** Nit de prueba: solo juega gratis; foldea ante cualquier apuesta. */
const nit: BaselineAgent = {
  id: "nit",
  name: "Nit de prueba",
  version: "test-0",
  decide: (info) => {
    if (info.legal.canCheck) return { type: "check" };
    return { type: "fold" };
  },
};

describe("eval/match", () => {
  it("1. determinismo: misma seed produce el mismo resultado", () => {
    const cfg = { hands: 50, seed: 7, startingStack: 1000, sb: 5, bb: 10 };
    const r1 = playMatch(station, nit, cfg);
    const r2 = playMatch(station, nit, cfg);
    expect(r1.bb100A).toBe(r2.bb100A);
    expect(r1).toEqual(r2);
  });

  it("2. conservación: 100 manos sin crear ni destruir fichas", () => {
    // verifyConservation (Σstacks + pot == 2*stack, pot == ΣbetHand) lanzaría
    // al descuadrar; el flag interno la exige al final de cada mano.
    _matchInterno.verificarCadaMano = true;
    try {
      const r = playMatch(station, nit, { hands: 100, seed: 11, startingStack: 1000, sb: 5, bb: 10 });
      expect(r.hands).toBe(100);
    } finally {
      _matchInterno.verificarCadaMano = false;
    }
  });

  it("3. duplicado: asientos fijos y botón alterno (A no queda siempre SB)", () => {
    for (let i = 0; i < 10; i++) {
      const s = asientosDeLaMano(i);
      expect(s.button).toBe(i % 2);
      // Asientos fijos: A siempre seat 0, B seat 1; el botón alterna.
      expect(s.asientoA).toBe(0);
      expect(s.asientoB).toBe(1);
    }
  });

  it("4. stats sanas: la station entra a más manos que el nit", () => {
    const r = playMatch(station, nit, { hands: 500, seed: 21, startingStack: 1000, sb: 5, bb: 10 });
    expect(r.statsA.hands).toBe(500);
    expect(r.statsB.hands).toBe(500);
    expect(r.statsA.vpip).toBeGreaterThan(r.statsB.vpip);
    expect(r.statsB.vpip).toBe(0);
  });

  it("5. rangos: showdown y wsd están en [0,1]", () => {
    const r = playMatch(station, nit, { hands: 200, seed: 33, startingStack: 1000, sb: 5, bb: 10 });
    for (const s of [r.statsA, r.statsB]) {
      for (const v of [s.vpip, s.pfr, s.threeBet, s.wtsd, s.wsd, s.showdownRate]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
      expect(Number.isFinite(s.aggro)).toBe(true);
      expect(s.aggro).toBeGreaterThanOrEqual(0);
    }
    expect(Number.isFinite(r.bb100A)).toBe(true);
  });

  it("6. ic95: el intervalo se estrecha con más manos", () => {
    const corto = playMatch(station, station, {
      hands: 100,
      seed: 44,
      startingStack: 1000,
      sb: 5,
      bb: 10,
    });
    const largo = playMatch(station, station, {
      hands: 2000,
      seed: 44,
      startingStack: 1000,
      sb: 5,
      bb: 10,
    });
    const ancho = (ci: [number, number]): number => ci[1] - ci[0];
    const aCorto = ancho(corto.ci95);
    const aLargo = ancho(largo.ci95);
    expect(Number.isFinite(aCorto)).toBe(true);
    expect(Number.isFinite(aLargo)).toBe(true);
    expect(aCorto).toBeGreaterThan(0);
    expect(aLargo).toBeGreaterThan(0);
    expect(aLargo).toBeLessThan(aCorto);
  });
});
