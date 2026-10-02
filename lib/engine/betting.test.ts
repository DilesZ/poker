// Tests del motor de apuestas (vitest). 9 casos: legalidad, pagos, all-in,
// cierres de ronda, HU preflop e invariante del bote. Cero deps.
import { describe, expect, it } from "vitest";
import { applyAction, getLegalActions, toCall } from "./betting";
import type { PokerState } from "@/lib/engine/types";

let mano = 0;

interface JugadorSemilla {
  seat: number;
  stack: number;
  betStreet?: number;
  betHand?: number;
}

function mesa(
  semillas: JugadorSemilla[],
  parcial: {
    street?: PokerState["street"];
    button?: number;
    actingSeat?: number | null;
    currentBet?: number;
    minRaise?: number;
    lastAggressor?: number | null;
    committed?: number;
  } = {},
): PokerState {
  const players = semillas.map((s) => ({
    seat: s.seat,
    name: `P${s.seat}`,
    stack: s.stack,
    betStreet: s.betStreet ?? 0,
    betHand: s.betHand ?? 0,
    folded: false,
    allIn: false,
    hole: [],
  }));
  const pot = players.reduce((acc, p) => acc + p.betHand, 0);
  return {
    handId: `test-${++mano}`,
    seed: 7,
    street: parcial.street ?? "flop",
    button: parcial.button ?? 0,
    sb: 10,
    bb: 20,
    ante: 0,
    players,
    board: [],
    deck: [],
    pot,
    committed: parcial.committed ?? players.reduce((acc, p) => acc + p.stack, 0) + pot,
    currentBet: parcial.currentBet ?? 0,
    minRaise: parcial.minRaise ?? 20,
    lastAggressor: parcial.lastAggressor ?? null,
    actingSeat: parcial.actingSeat ?? null,
  };
}

/** Suma de lo comprometido en la mano: el bote siempre debe igualarla. */
const sumaMano = (s: PokerState): number =>
  s.players.reduce((acc, p) => acc + p.betHand, 0);

describe("betting", () => {
  it("1. check ilegal con toCall>0 lanza", () => {
    const s = mesa(
      [
        { seat: 0, stack: 950, betStreet: 50, betHand: 50 },
        { seat: 1, stack: 1000, betStreet: 0, betHand: 0 },
      ],
      { currentBet: 50, minRaise: 50, lastAggressor: 0, actingSeat: 1, committed: 2000 },
    );
    expect(toCall(s, 1)).toBe(50);
    expect(getLegalActions(s, 1).canCheck).toBe(false);
    expect(() => applyAction(s, 1, { type: "check" })).toThrow(/igualar/);
  });

  it("2. call paga exacto y no muta el estado original", () => {
    const s = mesa(
      [
        { seat: 0, stack: 950, betStreet: 50, betHand: 50 },
        { seat: 1, stack: 1000, betStreet: 0, betHand: 0 },
      ],
      { currentBet: 50, minRaise: 50, lastAggressor: 0, actingSeat: 1, committed: 2000 },
    );
    expect(getLegalActions(s, 1).callAmount).toBe(50);
    const t = applyAction(s, 1, { type: "call" });
    const p1 = t.players.find((p) => p.seat === 1);
    expect(p1?.stack).toBe(950);
    expect(p1?.betStreet).toBe(50);
    expect(p1?.allIn).toBe(false);
    expect(t.pot).toBe(100);
    expect(t.actingSeat).toBeNull(); // vuelve al agresor igualado: cierra
    // Inmutabilidad: el original intacto.
    expect(s.players.find((p) => p.seat === 1)?.stack).toBe(1000);
    expect(s.pot).toBe(50);
  });

  it("3. call corto deja all-in sin mover currentBet", () => {
    const s = mesa(
      [
        { seat: 0, stack: 950, betStreet: 50, betHand: 50 },
        { seat: 1, stack: 30, betStreet: 0, betHand: 0 },
      ],
      { currentBet: 50, minRaise: 50, lastAggressor: 0, actingSeat: 1, committed: 1030 },
    );
    expect(getLegalActions(s, 1).callAmount).toBe(30);
    const t = applyAction(s, 1, { type: "call" });
    const p1 = t.players.find((p) => p.seat === 1);
    expect(p1?.stack).toBe(0);
    expect(p1?.betStreet).toBe(30);
    expect(p1?.allIn).toBe(true);
    expect(t.currentBet).toBe(50); // el call corto no sube la apuesta
    expect(t.pot).toBe(80);
    expect(t.actingSeat).toBeNull(); // P0 no debe nada: cerrada
  });

  it("4. bet fija currentBet, minRaise y agresor", () => {
    const s = mesa(
      [
        { seat: 0, stack: 1000, betStreet: 0, betHand: 0 },
        { seat: 1, stack: 1000, betStreet: 0, betHand: 0 },
      ],
      { actingSeat: 0, committed: 2000 },
    );
    const t = applyAction(s, 0, { type: "bet", amount: 40 });
    expect(t.currentBet).toBe(40);
    expect(t.minRaise).toBe(40);
    expect(t.lastAggressor).toBe(0);
    expect(t.players.find((p) => p.seat === 0)?.betStreet).toBe(40);
    expect(t.pot).toBe(40);
    expect(t.actingSeat).toBe(1);
    expect(t.committed).toBe(2000); // committed intacto
  });

  it("5. raise bajo min-raise lanza; all-in corto permitido sin reabrir", () => {
    const base = mesa(
      [
        { seat: 0, stack: 950, betStreet: 50, betHand: 50 },
        { seat: 1, stack: 1000, betStreet: 0, betHand: 0 },
      ],
      { currentBet: 50, minRaise: 50, lastAggressor: 0, actingSeat: 1, committed: 2000 },
    );
    // Subir a 70 = incremento 20 < minRaise 50 sin ir all-in → ilegal.
    expect(() => applyAction(base, 1, { type: "raise", to: 70 })).toThrow(/mínimo/);

    // All-in corto a 60 (incremento 10 < 50): permitido, no reabre.
    const corto = mesa(
      [
        { seat: 0, stack: 950, betStreet: 50, betHand: 50 },
        { seat: 1, stack: 60, betStreet: 0, betHand: 0 },
      ],
      { currentBet: 50, minRaise: 50, lastAggressor: 0, actingSeat: 1, committed: 1060 },
    );
    expect(getLegalActions(corto, 1).raiseToMin).toBe(60); // tope del all-in
    const t = applyAction(corto, 1, { type: "raise", to: 60 });
    expect(t.players.find((p) => p.seat === 1)?.allIn).toBe(true);
    expect(t.currentBet).toBe(60);
    expect(t.minRaise).toBe(50); // NO cambia
    expect(t.lastAggressor).toBe(0); // NO cambia
    expect(t.actingSeat).toBe(0); // P0 debe 10: aún decide
  });

  it("6. fold deja 1 vivo con actingSeat null y winners sin fijar", () => {
    const s = mesa(
      [
        { seat: 0, stack: 950, betStreet: 50, betHand: 50 },
        { seat: 1, stack: 1000, betStreet: 0, betHand: 0 },
      ],
      { currentBet: 50, minRaise: 50, lastAggressor: 0, actingSeat: 1, committed: 2000 },
    );
    const t = applyAction(s, 1, { type: "fold" });
    expect(t.players.find((p) => p.seat === 1)?.folded).toBe(true);
    expect(t.actingSeat).toBeNull();
    expect(t.winners).toBeUndefined(); // lo resuelve settle, no betting
  });

  it("7. cierre de ronda al igualar: vuelve al agresor y se cierra", () => {
    let s = mesa(
      [
        { seat: 0, stack: 1000 },
        { seat: 1, stack: 1000 },
        { seat: 2, stack: 1000 },
      ],
      { button: 2, actingSeat: 0, committed: 3000 },
    );
    s = applyAction(s, 0, { type: "bet", amount: 40 });
    expect(s.actingSeat).toBe(1);
    s = applyAction(s, 1, { type: "call" });
    expect(s.actingSeat).toBe(2); // P2 aún no iguala: sigue abierta
    s = applyAction(s, 2, { type: "call" });
    expect(s.actingSeat).toBeNull(); // todos igualan al volver al agresor
    expect(s.pot).toBe(120);
    expect(s.pot).toBe(sumaMano(s));
  });

  it("8. HU preflop: actúa la SB, limp = call y la BB puede pasar", () => {
    const s = mesa(
      [
        { seat: 0, stack: 990, betStreet: 10, betHand: 10 }, // SB (botón HU)
        { seat: 1, stack: 980, betStreet: 20, betHand: 20 }, // BB
      ],
      {
        street: "preflop",
        button: 0,
        currentBet: 20,
        minRaise: 20,
        lastAggressor: null,
        actingSeat: 0,
        committed: 2000,
      },
    );
    expect(s.actingSeat).toBe(0); // la SB abre preflop en HU
    const trasLimp = applyAction(s, 0, { type: "call" }); // limp: iguala la BB
    expect(trasLimp.players.find((p) => p.seat === 0)?.betStreet).toBe(20);
    expect(trasLimp.actingSeat).toBe(1); // la BB conserva su opción
    expect(getLegalActions(trasLimp, 1).canCheck).toBe(true);
    const trasCheck = applyAction(trasLimp, 1, { type: "check" });
    expect(trasCheck.actingSeat).toBeNull(); // mesa completa: cierra
    expect(trasCheck.pot).toBe(40);
  });

  it("9. pot == ΣbetHand tras cada acción (bet, raise, call, call)", () => {
    let s = mesa(
      [
        { seat: 0, stack: 1000 },
        { seat: 1, stack: 1000 },
        { seat: 2, stack: 1000 },
      ],
      { button: 2, actingSeat: 0, committed: 3000 },
    );
    s = applyAction(s, 0, { type: "bet", amount: 40 });
    expect(s.pot).toBe(sumaMano(s));
    s = applyAction(s, 1, { type: "raise", to: 100 });
    expect(s.pot).toBe(sumaMano(s));
    expect(s.currentBet).toBe(100);
    expect(s.minRaise).toBe(60);
    s = applyAction(s, 2, { type: "call" });
    expect(s.pot).toBe(sumaMano(s));
    s = applyAction(s, 0, { type: "call" });
    expect(s.pot).toBe(sumaMano(s));
    expect(s.pot).toBe(300);
    expect(s.actingSeat).toBeNull();
    expect(s.committed).toBe(3000); // committed = total inicial, intacto
  });
});
