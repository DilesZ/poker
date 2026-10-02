// lib/cfr/population-behavior.test.ts — Conducta del population training.
// Kuhn, héroe P0 fijo (heroSeats: 0) vs población SOLO-uniforme (2000 iters,
// cfr+): demuestra aprendizaje contra un pool fijo, sin self-play.
//
// NOTA DE HONESTIDAD (verificada empíricamente): exploitability() NO tiende
// a 0 aquí (mide ≈ 0.42) y eso es lo CORRECTO. exploitability mide distancia
// a Nash del perfil COMPLETO, y con P1 congelado en uniforme el perfil jamás
// puede ser Nash: el incentivo unilateral de P1 a desviarse ya aporta ~0.33
// por sí solo. La mejor respuesta contra un pool fijo malo es a su vez muy
// explotable (apuesta siempre, faroleando con J); aprender = maximizar valor
// frente al pool (≈ +0.5, muy por encima del valor del juego −1/18), no
// minimizar exploitability. Por eso este test afirma valor y estrategia, y
// documenta que expl se mantiene alta (> 0.3), en vez de exigir expl < 0.05.
import { describe, expect, it } from "vitest";
import { kuhnGame } from "../games/kuhn";
import { bestResponseValue, exploitability } from "./exploit";
import { strategyMap, trainVsPopulation } from "./trainer";

describe("cfr/population-training conducta vs pool fija", () => {
  it("héroe P0 vs solo-uniforme aprende la mejor respuesta (apuesta siempre, +0.5)", () => {
    const res = trainVsPopulation({
      game: kuhnGame,
      iterations: 2000,
      seed: 11,
      algorithm: "cfr+",
      population: { members: [{ id: "uni", kind: "uniform", weight: 1 }] },
      heroSeats: 0,
    });
    // Pool fija de verdad: las 2000 iteraciones salieron contra el uniforme.
    expect(res.opponentCounts).toEqual({ uni: 2000 });
    // Sin self-play: solo el héroe (P0) deja nodos; el oponente fijo ni los crea.
    expect(res.nodes.size).toBeGreaterThan(0);
    for (const clave of res.nodes.keys()) {
      expect(clave.startsWith("Kuhn:0:")).toBe(true);
    }
    const avg = strategyMap(res);
    // El héroe aprende a explotar al uniforme (que sobre-abandona): apuesta
    // siempre de inicio, con J (farol), Q y K (valor).
    for (const carta of ["J", "Q", "K"]) {
      const entrada = avg.get(`Kuhn:0:${carta}|`);
      expect(entrada).toBeDefined();
      if (entrada === undefined) throw new Error(`falta el infoset Kuhn:0:${carta}|`);
      expect(entrada.actions).toEqual(["pass", "bet"]);
      expect(entrada.probs[entrada.actions.indexOf("bet")] as number).toBeGreaterThan(0.9);
    }
    // Y cobra el máximo explotable frente al pool fijo (≈ +0.5), muy por
    // encima del valor del juego (−1/18 ≈ −0.056): aprendió contra el pool.
    expect(bestResponseValue(kuhnGame, avg, 0)).toBeGreaterThan(0.4);
    // ...pero el perfil completo sigue lejos de Nash (P1 sigue uniforme):
    // la BR contra un pool fijo es explotable por construcción.
    expect(exploitability(kuhnGame, avg)).toBeGreaterThan(0.3);
  }, 60000);
});
