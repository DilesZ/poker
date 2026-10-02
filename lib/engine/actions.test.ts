// Tests de la abstracción de acciones (vitest). 8 casos: estándar exacto,
// clamp por stack corto, deduplicación, SMALL vs LARGE, config a medida,
// respeto de raiseToMin, ausencia de bet/raise ilegales y all-in presente.
// Cero dependencias; solo tipos de ./types.
import { describe, expect, it } from "vitest";
import {
  LARGE_ABSTRACTION,
  SMALL_ABSTRACTION,
  STANDARD_ABSTRACTION,
  expandActions,
  resolveBetSize,
  type ActionAbstractionConfig,
} from "./actions";
import type { LegalActions } from "./types";

/** Acciones legales de un spot típico de flop con stack profundo. */
function spotFlop(): LegalActions {
  return {
    canFold: true,
    canCheck: false,
    canCall: false,
    callAmount: 0,
    canBet: true,
    betMin: 20,
    betMax: 1000,
    canRaise: false,
    raiseToMin: 0,
    raiseToMax: 0,
    canAllIn: true,
    allInAmount: 1000,
  };
}

/** Extrae los importes de las apuestas de tipo bet. */
function importesBet(acciones: ReturnType<typeof expandActions>): number[] {
  return acciones
    .filter((a) => a.type === "bet")
    .map((a) => (a.type === "bet" ? a.amount : 0));
}

describe("abstracción de acciones", () => {
  it("STANDARD en flop con bote 100 da 33/50/75 exactos", () => {
    const acciones = expandActions(spotFlop(), "flop", 20, 100, STANDARD_ABSTRACTION, 0, 20);
    expect(importesBet(acciones)).toEqual([33, 50, 75]);
  });

  it("el stack corto sujeta las apuestas a betMax", () => {
    const corto: LegalActions = { ...spotFlop(), betMax: 40, allInAmount: 40 };
    const acciones = expandActions(corto, "flop", 20, 100, STANDARD_ABSTRACTION, 0, 20);
    // 33 sobrevive; 50 y 75 colapsan a 40.
    expect(importesBet(acciones)).toEqual([33, 40]);
    for (const a of acciones) {
      if (a.type === "bet") expect(a.amount).toBeLessThanOrEqual(40);
    }
  });

  it("deduplica tamaños que colapsan al sujetar", () => {
    const cfg: ActionAbstractionConfig = {
      id: "duplicada",
      description: "Tres tamaños idénticos para forzar colapso.",
      preflopOpenTo: (bb) => [2 * bb],
      flopBet: [
        { kind: "pot", fraction: 0.5 },
        { kind: "pot", fraction: 0.5 },
        { kind: "pot", fraction: 0.5 },
      ],
      turnBet: [{ kind: "pot", fraction: 0.5 }],
      riverBet: [{ kind: "pot", fraction: 0.5 }],
      raiseTo: (actual, minima) => [actual + minima],
      alwaysAllowAllIn: false,
    };
    const legal: LegalActions = { ...spotFlop(), canAllIn: false };
    const acciones = expandActions(legal, "flop", 20, 100, cfg, 0, 20);
    expect(importesBet(acciones)).toEqual([50]);
  });

  it("SMALL y LARGE generan espacios distintos", () => {
    const pequena = expandActions(spotFlop(), "flop", 20, 100, SMALL_ABSTRACTION, 0, 20);
    const grande = expandActions(spotFlop(), "flop", 20, 100, LARGE_ABSTRACTION, 0, 20);
    expect(importesBet(pequena)).toEqual([50]);
    expect(importesBet(grande)).toEqual([33, 66, 100, 150]);
    expect(pequena.length).toBeLessThan(grande.length);
  });

  it("una config a medida cambia el espacio (apertura preflop)", () => {
    const aMedida: ActionAbstractionConfig = {
      ...STANDARD_ABSTRACTION,
      id: "a-medida",
      description: "Apertura de 4bb en lugar de 2.5bb.",
      preflopOpenTo: (bb) => [4 * bb],
    };
    const legal: LegalActions = {
      canFold: true,
      canCheck: false,
      canCall: false,
      callAmount: 0,
      canBet: true,
      betMin: 20,
      betMax: 1000,
      canRaise: false,
      raiseToMin: 0,
      raiseToMax: 0,
      canAllIn: true,
      allInAmount: 1000,
    };
    const base = expandActions(legal, "preflop", 20, 30, STANDARD_ABSTRACTION, 0, 20);
    const propia = expandActions(legal, "preflop", 20, 30, aMedida, 0, 20);
    expect(importesBet(base)).toEqual([50]);
    expect(importesBet(propia)).toEqual([80]);
  });

  it("las subidas respetan raiseToMin aunque la config pida menos", () => {
    const legal: LegalActions = {
      canFold: true,
      canCheck: false,
      canCall: true,
      callAmount: 40,
      canBet: false,
      betMin: 0,
      betMax: 0,
      canRaise: true,
      raiseToMin: 80,
      raiseToMax: 1000,
      canAllIn: true,
      allInAmount: 1000,
    };
    const cfg: ActionAbstractionConfig = {
      ...STANDARD_ABSTRACTION,
      id: "subida-baja",
      raiseTo: () => [10, 20],
    };
    const acciones = expandActions(legal, "turn", 20, 200, cfg, 40, 40);
    const subidas = acciones
      .filter((a) => a.type === "raise")
      .map((a) => (a.type === "raise" ? a.to : 0));
    // Ambos objetivos (10, 20) quedan sujetos al mínimo legal 80 y deduplicados.
    expect(subidas).toEqual([80]);
  });

  it("no emite bet si !canBet ni raise si !canRaise (y viceversa)", () => {
    const sinApuesta: LegalActions = {
      canFold: true,
      canCheck: true,
      canCall: false,
      callAmount: 0,
      canBet: false,
      betMin: 0,
      betMax: 0,
      canRaise: true,
      raiseToMin: 60,
      raiseToMax: 500,
      canAllIn: false,
      allInAmount: 0,
    };
    const sinApuestaAcc = expandActions(sinApuesta, "flop", 20, 100, STANDARD_ABSTRACTION, 40, 20);
    expect(sinApuestaAcc.some((a) => a.type === "bet")).toBe(false);
    expect(sinApuestaAcc.some((a) => a.type === "raise")).toBe(true);

    const sinSubida: LegalActions = {
      ...spotFlop(),
      canRaise: false,
      raiseToMin: 0,
      raiseToMax: 0,
    };
    const sinSubidaAcc = expandActions(sinSubida, "flop", 20, 100, STANDARD_ABSTRACTION, 0, 20);
    expect(sinSubidaAcc.some((a) => a.type === "bet")).toBe(true);
    expect(sinSubidaAcc.some((a) => a.type === "raise")).toBe(false);
  });

  it("el all-in está presente si hay stack y no duplica tipos", () => {
    const acciones = expandActions(spotFlop(), "river", 20, 100, STANDARD_ABSTRACTION, 0, 20);
    expect(acciones.some((a) => a.type === "allin")).toBe(true);
    // Sin duplicados exactos {type, amount/to}: cada bet aparece una sola vez.
    const claves = acciones.map((a) =>
      a.type === "bet"
        ? `bet:${a.amount}`
        : a.type === "raise"
          ? `raise:${a.to}`
          : a.type,
    );
    expect(new Set(claves).size).toBe(claves.length);
    // resolveBetSize: min = bb y clamp mínimo 1.
    expect(resolveBetSize({ kind: "min" }, 100, 20, 1000)).toBe(20);
    expect(resolveBetSize({ kind: "pot", fraction: 0 }, 100, 20, 1000)).toBe(1);
  });
});
