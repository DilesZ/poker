// Tests de equity/EV del coach. En español. Sin dependencias salvo vitest.
import { describe, expect, it } from "vitest";
import { actionContext, actionEV, equityVsRandom, madeHandName } from "./ev";
import type { Card, Rank, Suit } from "../poker/types";
import type { CoachActionType, CoachStreet, HandAction, HandRecord } from "./types";

function C(rank: Rank, suit: Suit): Card {
  return { rank, suit };
}

function acc(
  street: CoachStreet,
  seat: number,
  action: CoachActionType,
  amount = 0,
  potAfter = 0,
): HandAction {
  return { street, seat, action, amount, potAfter };
}

// HandRecord con cartas opcionales (como StoredHand del store).
type ConCartas = HandRecord & { heroHole?: Card[]; board?: Card[] };

function mano(
  id: string,
  acciones: HandAction[],
  heroHole?: Card[],
  board?: Card[],
  heroSeat = 0,
): ConCartas {
  return {
    id,
    ts: 1,
    heroSeat,
    button: 1,
    positions: { 0: "BTN", 1: "BB" },
    actions: acciones,
    result: { bbWon: 0, showdown: false },
    heroHole,
    board,
  };
}

// Escalera de color nut imbatible y no empatable: héroe 9♥-A♠ en mesa
// 5♥ 6♥ 7♥ 8♥ 2♣. El 9♥ es único (sin él no hay color a la escalera rival
// superior ni empate posible) y nada distinto a escalera de color la supera.
const HOLE_NUT: [Card, Card] = [C(9, "♥"), C(14, "♠")];
const BOARD_NUT: Card[] = [C(5, "♥"), C(6, "♥"), C(7, "♥"), C(8, "♥"), C(2, "♣")];

describe("lib/coach/ev", () => {
  it("fold tiene EV 0 BB exacto", () => {
    const rec = mano("fold-1", [acc("river", 0, "fold", 0, 200)], [...HOLE_NUT], [...BOARD_NUT]);
    expect(actionEV(rec, 0, 20)).toEqual({ kind: "exact", evBB: 0 });
  });

  it("river: nuts → equity 1.0 exacta y call EV calculado a mano", () => {
    const eq = equityVsRandom([...HOLE_NUT], [...BOARD_NUT]);
    expect(eq.exact).toBe(true);
    expect(eq.sampleSize).toBe(990); // C(45,2)
    expect(eq.equity).toBe(1);
    // Call a mano: (1.0·200 − 40)/20 = 160/20 = 8 BB.
    const rec = mano("river-1", [acc("river", 0, "call", 40, 200)], [...HOLE_NUT], [...BOARD_NUT]);
    expect(actionEV(rec, 0, 20)).toEqual({ kind: "exact", evBB: 8 });
  });

  it("turn es determinista entre llamadas y exacto", { timeout: 60000 }, () => {
    const hole: [Card, Card] = [C(12, "♠"), C(11, "♠")];
    const board: Card[] = [C(14, "♠"), C(13, "♥"), C(7, "♦"), C(2, "♣")];
    const a = equityVsRandom(hole, board);
    const b = equityVsRandom(hole, board);
    expect(a).toEqual(b);
    expect(a.exact).toBe(true);
    expect(a.equity).toBeGreaterThanOrEqual(0);
    expect(a.equity).toBeLessThanOrEqual(1);
  });

  it("flop usa la misma semilla: mismo valor entre llamadas, no exacto", () => {
    const hole: [Card, Card] = [C(14, "♠"), C(13, "♥")];
    const board: Card[] = [C(12, "♦"), C(7, "♣"), C(2, "♠")];
    const a = equityVsRandom(hole, board);
    const b = equityVsRandom(hole, board);
    expect(a.equity).toBe(b.equity);
    expect(a.exact).toBe(false);
    expect(a.sampleSize).toBe(3000);
    expect(a.equity).toBeGreaterThanOrEqual(0);
    expect(a.equity).toBeLessThanOrEqual(1);
  });

  it("preflop pondera el bucket y cae en [0,1]", () => {
    const eq = equityVsRandom([C(14, "♠"), C(14, "♥")], []); // AA → B0
    expect(eq.exact).toBe(false);
    expect(eq.equity).toBeGreaterThanOrEqual(0);
    expect(eq.equity).toBeLessThanOrEqual(1);
  });

  it("bet/raise/allin quedan unavailable (requieren modelo de fold rival)", () => {
    const rec = mano(
      "agr-1",
      [
        acc("river", 0, "bet", 60, 260),
        acc("river", 0, "raise", 120, 380),
        acc("river", 0, "allin", 400, 780),
      ],
      [...HOLE_NUT],
      [...BOARD_NUT],
    );
    for (let i = 0; i < 3; i++) {
      expect(actionEV(rec, i, 20)).toEqual({
        kind: "unavailable",
        reason: "requiere modelo de fold rival",
      });
    }
  });

  it("sin cartas → unavailable en EV y null en contexto", () => {
    const rec = mano("sin-1", [acc("river", 0, "call", 40, 200)]);
    expect(actionEV(rec, 0, 20)).toEqual({
      kind: "unavailable",
      reason: "mano sin cartas registradas",
    });
    expect(actionContext(rec, 0)).toBeNull();
  });

  it("board incompleto para la calle → unavailable", () => {
    // Acción de turn (necesita 4) con solo 3 de board registradas.
    const rec = mano(
      "inc-1",
      [acc("turn", 0, "call", 40, 200)],
      [C(14, "♠"), C(14, "♥")],
      [C(13, "♠"), C(7, "♦"), C(2, "♣")],
    );
    expect(actionEV(rec, 0, 20)).toEqual({
      kind: "unavailable",
      reason: "board incompleto",
    });
    expect(actionContext(rec, 0)).toBeNull();
  });

  it("actionContext aproxima potOdds como amount/potAfter", () => {
    const rec = mano("ctx-1", [acc("river", 0, "call", 40, 200)], [...HOLE_NUT], [...BOARD_NUT]);
    const ctx = actionContext(rec, 0);
    expect(ctx).not.toBeNull();
    expect(ctx?.potOdds).toBeCloseTo(0.2, 10); // 40/200
    expect(ctx?.needed).toBeCloseTo(0.2, 10);
    expect(ctx?.equity).toBe(1);
    expect(ctx?.equityExact).toBe(true);
    expect(ctx?.equityN).toBe(990);
    expect(ctx?.madeHand).toBe("straight flush");
    // Preflop (sin board): madeHand literal (<5 cartas) y equity de tabla.
    const pre = mano(
      "ctx-2",
      [acc("preflop", 0, "call", 40, 100)],
      [C(14, "♠"), C(13, "♠")],
      [],
    );
    expect(actionContext(pre, 0)?.madeHand).toBe("preflop (sin showdown aún)");
    expect(madeHandName([C(14, "♠"), C(13, "♠")], [])).toBe("preflop (sin showdown aún)");
  });
});
