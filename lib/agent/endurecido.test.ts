// Tests de endurecimiento del cerebro tabula rasa.
import { describe, expect, it } from "vitest";
import { chooseBrainAction, createBrain, reflectOnHand } from "./brain";
import {
  buildHandRecord,
  claveDesdeContexto,
  claveSituacion,
  RULETA_SITUACIONES,
} from "./reflection";

describe("endurecido cerebro", () => {
  it("lessons se capa a las últimas 100", () => {
    let brain = createBrain();
    // Misma acción (call) con win/loss alterno: la prior oscila sin tocar
    // techo/suelo y cada mano genera lección (cambio >0.02).
    for (let i = 0; i < 150; i++) {
      const won = i % 2 === 0;
      const record = buildHandRecord({
        won,
        myCards: "A♠ K♠",
        board: "K♦ 7♣ 2♠",
        street: "flop",
        actions: [{ street: "flop", type: "call", amount: 60, toCall: 60 }],
        showdown: false,
        potWon: won ? 100 : 0,
        stackDelta: won ? 50 : -50,
      });
      brain = reflectOnHand(brain, record).brain;
    }
    expect(brain.handsPlayed).toBe(150);
    expect(brain.lessons.length).toBeLessThanOrEqual(100);
    expect(brain.lessons.length).toBe(100);
  });

  it("contador por situación crece y epsilon re-anneal si winrate bajo tras 110", () => {
    let brain = createBrain();
    // 120 derrotas seguidas en flop/hasPot para forzar winrate bajo.
    for (let i = 0; i < 120; i++) {
      const record = buildHandRecord({
        won: false,
        myCards: "7♦ 2♣",
        board: "A♠ K♥ Q♦",
        street: "flop",
        actions: [{ street: "flop", type: "call", amount: 60, toCall: 60 }],
        showdown: false,
        potWon: 0,
        stackDelta: -60,
      });
      brain = reflectOnHand(brain, record).brain;
    }
    expect(brain.handsPlayed).toBe(120);
    // Contador por situación existe y suma.
    const totalCounts = Object.values(brain.counts ?? {}).reduce((a, b) => a + b, 0);
    expect(totalCounts).toBe(120);
    // Con 0 victorias, winrate 0 <0.4 y hands>110 → epsilon re-anneal ≥0.15.
    expect(brain.epsilon).toBeGreaterThanOrEqual(0.15);
  });

  it("clave con numRivales HU/multi y fallback 0.5 para claves viejas", () => {
    const brain = createBrain();
    // Priors nuevos existen.
    expect(brain.priors["flop/hasPot/HU/call"]).toBe(0.5);
    expect(brain.priors["flop/hasPot/multi/call"]).toBe(0.5);
    // Viejas siguen.
    expect(brain.priors["flop/hasPot/call"]).toBe(0.5);
    expect(RULETA_SITUACIONES).toContain("preflop/toCall0");
    expect(RULETA_SITUACIONES).toContain("flop/hasPot/HU");

    const sinDato = claveDesdeContexto({
      street: "flop",
      boardLen: 3,
      myStack: 900,
      pot: 200,
      toCall: 60,
    });
    expect(sinDato).toBe("flop/hasPot");

    const hu = claveDesdeContexto({
      street: "flop",
      boardLen: 3,
      myStack: 900,
      pot: 200,
      toCall: 60,
      numRivales: 1,
    });
    expect(hu).toBe("flop/hasPot/HU");

    const multi = claveDesdeContexto({
      street: "flop",
      boardLen: 3,
      myStack: 900,
      pot: 200,
      toCall: 0,
      numRivales: 3,
    });
    expect(multi).toBe("flop/toCall0/multi");

    // Registro viejo sin numRivales → clave vieja.
    const viejo = buildHandRecord({
      won: true,
      myCards: "A♠ K♠",
      board: "K♦ 7♣ 2♠",
      actions: [{ street: "flop", type: "call", amount: 60, toCall: 60 }],
    });
    expect(claveSituacion(viejo)).toBe("flop/hasPot");

    // Registro nuevo con rivales → clave nueva.
    const nuevo = buildHandRecord({
      won: true,
      myCards: "A♠ K♠",
      board: "K♦ 7♣ 2♠",
      actions: [{ street: "flop", type: "call", amount: 60, toCall: 60 }],
      numRivales: 1,
    });
    expect(claveSituacion(nuevo)).toBe("flop/hasPot/HU");

    // El cerebro elige sin romper con claves nuevas (fallback 0.5).
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
    const accion = chooseBrainAction({ ...brain, epsilon: 0 }, legal, ctx);
    expect(["fold", "call"]).toContain(accion.type);
  });
});
