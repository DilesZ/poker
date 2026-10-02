// Tests del cerebro autónomo (vitest). 4 casos: tabula rasa, sube, baja y epsilon.
// V2: crédito total con magnitud (0.08/-0.06 * 0.8^d * magnitud). Test2: mag=0.5+90/200=0.95 step=0.076 → 0.576 (toFixed 0.58). Test3: mag=0.5+1=1.5 step=-0.09 → 0.41.
import { describe, expect, it } from "vitest";
import { chooseBrainAction, createBrain, reflectOnHand } from "./brain";
import { buildHandRecord, RULETA_SITUACIONES } from "./reflection";

describe("brain", () => {
  it("1. tabula rasa: priors uniformes 0.5 y sin estrategia aprendida", () => {
    const brain = createBrain();
    expect(brain.handsPlayed).toBe(0);
    expect(brain.lessons).toEqual([]);
    expect(brain.beliefs).toEqual(["estoy aprendiendo"]);
    expect(brain.epsilon).toBe(0.9);
    // Regla de claves: situación + acción, todas al 0.5.
    expect(RULETA_SITUACIONES).toContain("preflop/toCall0");
    expect(RULETA_SITUACIONES).toContain("flop/hasPot");
    expect(brain.priors["preflop/toCall0/fold"]).toBe(0.5);
    expect(brain.priors["flop/hasPot/call"]).toBe(0.5);
    expect(Object.values(brain.priors).every((p) => p === 0.5)).toBe(true);

    // Con epsilon 0.9 elige entre candidatos legales (nunca inventa acciones).
    const legal = {
      candidates: [
        { type: "fold" as const },
        { type: "call" as const },
        { type: "raise" as const },
      ],
      toCall: 60,
      pot: 200,
      stack: 940,
    };
    const ctx = { street: "flop" as const, boardLen: 3, myStack: 940, pot: 200, toCall: 60 };
    for (let i = 0; i < 30; i++) {
      const accion = chooseBrainAction(brain, legal, ctx);
      expect(["fold", "call", "raise"]).toContain(accion.type);
      if (accion.type === "raise") expect(accion.size).toBeGreaterThan(0);
    }
  });

  it("2. reflexión sube la prior de la acción usada si ganó", () => {
    const brain = createBrain();
    const record = buildHandRecord({
      won: true,
      myCards: "A♠ K♠",
      board: "K♦ 7♣ 2♠ 5♥ 9♦",
      showdown: true,
      actions: [{ street: "flop", type: "call", amount: 60, toCall: 60 }],
      potWon: 180,
      stackDelta: 90,
    });
    const { brain: aprendido, lesson } = reflectOnHand(brain, record);

    expect(aprendido.handsPlayed).toBe(1);
    // Ventaja: (90-(-5))/100=0.95 → step 0.055*0.95*0.95≈0.0496 → 0.55.
    expect(aprendido.priors["flop/hasPot/call"]).toBeCloseTo(0.55, 6);
    // Inmutable: el cerebro original no se toca.
    expect(brain.priors["flop/hasPot/call"]).toBe(0.5);
    expect(brain.handsPlayed).toBe(0);

    expect(lesson).toBeDefined();
    expect(lesson?.outcome).toBe("victoria");
    expect(lesson?.situation).toContain("call 60 en flop");
    expect(lesson?.insight).toContain("gané el bote");
    expect(lesson?.change).toBe("subí a 0.55 la prior de llamar en flop");
    expect(aprendido.lessons).toHaveLength(1);
  });

  it("3. reflexión baja la prior de la acción usada si perdió", () => {
    const brain = createBrain();
    const record = buildHandRecord({
      won: false,
      myCards: "9♦ 9♣",
      board: "A♠ K♥ 2♦ 7♣ J♠",
      showdown: true,
      actions: [{ street: "flop", type: "raise", amount: 80, toCall: 0 }],
      potWon: 0,
      stackDelta: -80,
    });
    const { brain: aprendido, lesson } = reflectOnHand(brain, record);

    // Apertura de bote sin precio: clave flop/toCall0 (sin marcador "(precio").
    // Ventaja: (-80-(-5))/100=-0.75 → step 0.055*-0.75*1.5≈-0.062 → 0.438.
    expect(aprendido.priors["flop/toCall0/raise"]).toBeCloseTo(0.438, 6);
    expect(aprendido.handsPlayed).toBe(1);
    expect(lesson?.outcome).toBe("derrota");
    expect(lesson?.change).toBe("bajé a 0.44 la prior de subir en flop");
    expect(lesson?.handsPlayed).toBe(1);
  });

  it("4. epsilon decae 2% por mano y tiene suelo en 0.1", () => {
    const record = buildHandRecord({
      won: true,
      myCards: "Q♠ Q♥",
      board: "Q♦ 4♣ 9♠ 2♥ 7♦",
      showdown: false,
      actions: [{ street: "flop", type: "check" }],
      potWon: 40,
      stackDelta: 20,
    });

    const inicial = createBrain();
    const trasUna = reflectOnHand(inicial, record).brain;
    expect(trasUna.epsilon).toBeCloseTo(0.9 * 0.98, 6);
    expect(trasUna.epsilon).toBeLessThan(inicial.epsilon);

    let actual = trasUna;
    for (let i = 0; i < 300; i++) actual = reflectOnHand(actual, record).brain;
    expect(actual.epsilon).toBe(0.1);
    expect(actual.handsPlayed).toBe(301);
    // Cada 10 manos las beliefs se actualizan con el balance de lecciones.
    expect(actual.beliefs[actual.beliefs.length - 1]).toMatch(/^voy \d+W-\d+D, /);
    expect(actual.beliefs.length).toBeLessThanOrEqual(6);
  });
});
