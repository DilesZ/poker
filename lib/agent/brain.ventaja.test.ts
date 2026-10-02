// Tests de ventaja vs baseline: el fold correcto suma, el baseline aprende
// el coste esperado y las lecciones miden ventaja (no won binario).
import { describe, expect, it } from "vitest";
import { createBrain, reflectOnHand } from "./brain";
import { buildHandRecord } from "./reflection";

function recordFold(delta: number, won: boolean) {
  return buildHandRecord({
    won,
    myCards: "7♦ 2♣",
    board: "A♠ K♥ Q♦",
    street: "flop",
    actions: [{ street: "preflop", type: "fold" }],
    showdown: false,
    potWon: 0,
    stackDelta: delta,
  });
}

describe("ventaja vs baseline", () => {
  it("1. fold perdiendo solo ciegas suma (fold correcto), no resta", () => {
    const brain = createBrain();
    const { brain: b1 } = reflectOnHand(brain, recordFold(-20, false));
    // El fold sin precio cubre "hasPot" (cuboDe: fold implica precio).
    // ventaja=(-20+5)/100=-0.15 → pero floor good-fold +0.15.
    const clave = "preflop/hasPot";
    expect(b1.priors[`${clave}/fold`] ?? 0.5).toBeGreaterThan(0.5);
    expect(b1.baselines?.[clave]).toBeCloseTo(-5 + 0.15 * (-20 + 5), 3);
  });

  it("2. fold tras invertir mucho resta (no fue buen fold)", () => {
    const brain = createBrain();
    const { brain: b1 } = reflectOnHand(brain, recordFold(-120, false));
    const clave = "preflop/hasPot";
    // ventaja=(-120+5)/100=-1.15→clamp -1 → step negativo.
    expect(b1.priors[`${clave}/fold`] ?? 0.5).toBeLessThan(0.5);
  });

  it("3. el baseline converge al coste observado (EMA)", () => {
    let brain = createBrain();
    for (let i = 0; i < 30; i++) {
      brain = reflectOnHand(brain, recordFold(-20, false)).brain;
    }
    // EMA con alfa 0.15 desde -5 hacia -20: -5 + (-15)*(1-0.85^30).
    const esperado = -5 - 15 * (1 - Math.pow(0.85, 30));
    expect(brain.baselines?.["preflop/hasPot"] ?? 0).toBeCloseTo(esperado, 1);
  });

  it("4. derrota nominal con fold barato cuenta como victoria (ventaja>0)", () => {
    const brain = createBrain();
    const { lesson } = reflectOnHand(brain, recordFold(-10, false));
    // Primera mano siempre genera lección; el outcome manda la ventaja.
    expect(lesson?.outcome).toBe("victoria");
    expect(lesson).toMatchObject({ stackDelta: -10, showdown: false });
  });

  it("5. victoria grande sigue pesando más que un buen fold", () => {
    const b = createBrain();
    const win = buildHandRecord({
      won: true,
      myCards: "A♠ K♠",
      board: "K♦ 7♣ 2♠ 5♥ 9♦",
      showdown: true,
      actions: [{ street: "river", type: "call", amount: 100, toCall: 100 }],
      potWon: 400,
      stackDelta: 250,
    });
    const r1 = reflectOnHand(b, win);
    const r2 = reflectOnHand(b, recordFold(-20, false));
    const subeWin = (r1.brain.priors["river/hasPot/call"] ?? 0.5) - 0.5;
    const subeFold = (r2.brain.priors["preflop/hasPot/fold"] ?? 0.5) - 0.5;
    expect(subeWin).toBeGreaterThan(subeFold * 3);
  });
});
