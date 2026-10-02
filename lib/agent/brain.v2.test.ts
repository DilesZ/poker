// Tests CEREBRO V2: crédito total, magnitud, claves ricas, fallback y contrafactual.
import { describe, expect, it } from "vitest";
import {
  chooseBrainAction,
  createBrain,
  priorConFallback,
  reflectOnHand,
} from "./brain";
import {
  bucketPrecio,
  bucketStack,
  buildHandRecord,
  claveDesdeContexto,
  claveSituacion,
  RULETA_SITUACIONES,
} from "./reflection";

describe("brain V2", () => {
  it("1. crédito total: las 3 acciones históricas se mueven", () => {
    const brain = createBrain();
    const record = buildHandRecord({
      won: true,
      myCards: "A♠ K♠",
      board: "K♦ 7♣ 2♠",
      actions: [
        { street: "preflop", type: "call", amount: 20, toCall: 20 },
        { street: "flop", type: "check" },
        { street: "turn", type: "raise", amount: 100, toCall: 0 },
      ],
      showdown: false,
      potWon: 200,
      stackDelta: 100,
      numRivales: 1,
    });
    const { brain: aprendido, lesson } = reflectOnHand(brain, record);
    // Claves ricas esperadas (stack 300→mid, HU):
    // preflop call 20 vs pot 200 → cheap; flop check → free; turn raise sin precio → free.
    expect(aprendido.priors["preflop/cheap/mid/HU/call"]).toBeGreaterThan(0.5);
    expect(aprendido.priors["flop/free/mid/HU/check"]).toBeGreaterThan(0.5);
    expect(aprendido.priors["turn/free/mid/HU/raise"]).toBeGreaterThan(0.5);
    // La última (d=0) aprende más que la primera (d=2, discount 0.64).
    const primera = aprendido.priors["preflop/cheap/mid/HU/call"] as number;
    const ultima = aprendido.priors["turn/free/mid/HU/raise"] as number;
    expect(ultima).toBeGreaterThan(primera);
    expect(lesson?.actionsCredited).toBe(3);
    expect(lesson?.magnitude).toBeGreaterThan(0.5);
  });

  it("2. magnitud: bote 500 aprende más que bote 40", () => {
    const mk = (potWon: number, stackDelta: number) =>
      buildHandRecord({
        won: true,
        myCards: "A♠ K♠",
        board: "K♦ 7♣ 2♠",
        actions: [{ street: "flop", type: "call", amount: 60, toCall: 60 }],
        showdown: false,
        potWon,
        stackDelta,
      });
    const grande = reflectOnHand(createBrain(), mk(500, 200)).brain;
    const chico = reflectOnHand(createBrain(), mk(40, 10)).brain;
    const pGrande = grande.priors["flop/hasPot/call"] as number;
    const pChico = chico.priors["flop/hasPot/call"] as number;
    expect(pGrande).toBeGreaterThan(0.5);
    expect(pChico).toBeGreaterThan(0.5);
    expect(pGrande).toBeGreaterThan(pChico);
  });

  it("3. clave rica distinta HU vs multi y free vs pricey", () => {
    expect(bucketPrecio(0, 200)).toBe("free");
    expect(bucketPrecio(60, 200)).toBe("cheap"); // 60/260=0.23
    expect(bucketPrecio(200, 200)).toBe("pricey"); // 0.5
    expect(bucketStack(100)).toBe("short");
    expect(bucketStack(300)).toBe("mid");
    expect(bucketStack(900)).toBe("deep");

    const base = { street: "flop" as const, boardLen: 3, myStack: 900, pot: 200, toCall: 60 };
    const hu = claveDesdeContexto({ ...base, numRivales: 1 });
    const multi = claveDesdeContexto({ ...base, numRivales: 3 });
    expect(hu).toBe("flop/cheap/deep/HU");
    expect(multi).toBe("flop/cheap/deep/multi");
    expect(hu).not.toBe(multi);

    const free = claveDesdeContexto({ ...base, toCall: 0, numRivales: 1 });
    const pricey = claveDesdeContexto({ ...base, toCall: 200, numRivales: 1 });
    expect(free).toBe("flop/free/deep/HU");
    expect(pricey).toBe("flop/pricey/deep/HU");
    expect(free).not.toBe(pricey);

    // claveSituacion rica también distingue.
    const rHu = buildHandRecord({
      won: true,
      myCards: "A♠ K♠",
      board: "K♦ 7♣ 2♠",
      actions: [{ street: "flop", type: "call", amount: 60, toCall: 60 }],
      potWon: 200,
      stackDelta: 100,
      numRivales: 1,
    });
    const rMulti = buildHandRecord({
      won: true,
      myCards: "A♠ K♠",
      board: "K♦ 7♣ 2♠",
      actions: [{ street: "flop", type: "call", amount: 60, toCall: 60 }],
      potWon: 200,
      stackDelta: 100,
      numRivales: 3,
    });
    expect(claveSituacion(rHu)).toContain("/HU");
    expect(claveSituacion(rMulti)).toContain("/multi");
    expect(claveSituacion(rHu)).not.toBe(claveSituacion(rMulti));
    expect(RULETA_SITUACIONES).toContain("preflop/toCall0");
    expect(RULETA_SITUACIONES).toContain("flop/hasPot");
  });

  it("4. fallback vieja→nueva cuando falta la rica", () => {
    const brain = createBrain();
    // Borra la rica y fija la vieja con rivales a 0.8.
    const priors = { ...brain.priors };
    delete priors["flop/cheap/deep/HU/call"];
    priors["flop/hasPot/HU/call"] = 0.8;
    priors["flop/hasPot/call"] = 0.7;
    expect(priorConFallback(priors, "flop/cheap/deep/HU", "call")).toBeCloseTo(0.8, 6);
    // Sin vieja con rivales, cae a la vieja sin rivales.
    delete priors["flop/hasPot/HU/call"];
    expect(priorConFallback(priors, "flop/cheap/deep/HU", "call")).toBeCloseTo(0.7, 6);
    // Sin nada, 0.5.
    delete priors["flop/hasPot/call"];
    expect(priorConFallback(priors, "flop/cheap/deep/HU", "call")).toBe(0.5);
    // free → toCall0.
    const p2 = { ...brain.priors };
    delete p2["flop/free/mid/HU/check"];
    p2["flop/toCall0/HU/check"] = 0.65;
    expect(priorConFallback(p2, "flop/free/mid/HU", "check")).toBeCloseTo(0.65, 6);
  });

  it("5. contrafactual: la no usada baja cuando gana la usada", () => {
    const brain = createBrain();
    const record = buildHandRecord({
      won: true,
      myCards: "A♠ K♠",
      board: "K♦ 7♣ 2♠",
      actions: [{ street: "flop", type: "call", amount: 60, toCall: 60 }],
      showdown: false,
      potWon: 200,
      stackDelta: 100,
      numRivales: 1,
    });
    const { brain: aprendido } = reflectOnHand(brain, record);
    const clave = claveSituacion(record); // flop/cheap/mid/HU
    expect(clave).toBe("flop/cheap/mid/HU");
    const usada = aprendido.priors[`${clave}/call`] as number;
    const noUsada = aprendido.priors[`${clave}/fold`] as number;
    expect(usada).toBeGreaterThan(0.5);
    expect(noUsada).toBeLessThan(0.5);
  });

  it("6. epsilon efectivo por visitas no rompe la elección", () => {
    const brain = createBrain();
    const legal = {
      candidates: [{ type: "fold" as const }, { type: "call" as const }],
      toCall: 60,
      pot: 200,
      stack: 940,
    };
    const ctx = {
      street: "flop" as const,
      boardLen: 3,
      myStack: 940,
      pot: 200,
      toCall: 60,
      numRivales: 1,
    };
    // Con epsilon 0 y sin visitas, effEps = max(0.05, min(0,1)) = 0.05 → 5% explora.
    // Fijamos random para forzar explotación y comprobar que no inventa.
    const orig = Math.random;
    (Math as unknown as { random: () => number }).random = () => 0.99;
    try {
      const accion = chooseBrainAction({ ...brain, epsilon: 0 }, legal, ctx);
      expect(["fold", "call"]).toContain(accion.type);
    } finally {
      (Math as unknown as { random: () => number }).random = orig;
    }
  });
});
