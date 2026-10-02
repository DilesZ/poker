// Tests de dream consolidation (3): mueve más con 200, clip, determinista.
// EV-ponderado: flip won?0.08:0.20, jitter ±25%, alto EV (|delta|>100) duplica.
// V3: claves ricas con fuerza (weak/mid/strong) bajo demanda → distancia por unión.
import { describe, expect, it } from "vitest";
import { createBrain } from "./brain";
import { buildHandRecord } from "./reflection";
import { dreamConsolidate } from "./dream";

function registroGanado() {
  return buildHandRecord({
    won: true,
    myCards: "A♠ K♠",
    board: "K♦ 7♣ 2♠",
    showdown: false,
    actions: [{ street: "flop", type: "call", amount: 60, toCall: 60 }],
    potWon: 180,
    stackDelta: 90,
    numRivales: 1,
  });
}

function distancia(a: Record<string, number>, b: Record<string, number>): number {
  // Unión de claves: V3 crea claves nuevas bajo demanda (calle/precio/stack/
  // rival/fuerza/acción) que no están en base.priors; hay que contarlas.
  const claves = new Set([...Object.keys(a), ...Object.keys(b)]);
  let s = 0;
  for (const k of claves) s += Math.abs((a[k] ?? 0.5) - (b[k] ?? 0.5));
  return s;
}

describe("dream", () => {
  it("200 sueños mueven priors más que 1", () => {
    const base = createBrain();
    const rec = registroGanado();
    const uno = dreamConsolidate(base, rec, 1, 42);
    const muchos = dreamConsolidate(base, rec, 200, 42);
    const d1 = distancia(base.priors, uno.priors);
    const d200 = distancia(base.priors, muchos.priors);
    expect(d200).toBeGreaterThan(d1);
    expect(d1).toBeGreaterThan(0);
  });

  it("no rompe el clip 0.05-0.95", () => {
    const base = createBrain();
    base.priors["flop/hasPot/call"] = 0.94;
    const rec = registroGanado();
    const sonado = dreamConsolidate(base, rec, 200, 7);
    for (const v of Object.values(sonado.priors)) {
      expect(v).toBeGreaterThanOrEqual(0.05);
      expect(v).toBeLessThanOrEqual(0.95);
    }
  });

  it("determinista con seed", () => {
    const base = createBrain();
    const rec = registroGanado();
    const a = dreamConsolidate(base, rec, 50, 123);
    const b = dreamConsolidate(base, rec, 50, 123);
    expect(a.priors).toEqual(b.priors);
  });
});
