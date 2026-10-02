// Tests de infosets (vitest). 6 casos: determinismo, no-filtrado,
// posiciones, toCall/minRaiseTo, historial y throw sin hole. Cero deps.
import { describe, expect, it } from "vitest";
import type { Card } from "@/lib/poker/types";
import type { PokerState } from "@/lib/engine/types";
import { applyAction } from "./betting";
import { advanceStreet } from "./settle";
import { getInformationSet, getInformationSetKey, positionOf } from "./infoset";

/** Carta corta: rango 2-14 y palo francés. */
function carta(rank: Card["rank"], suit: Card["suit"]): Card {
  return { rank, suit };
}

interface Semilla {
  seat: number;
  stack: number;
  betStreet?: number;
  betHand?: number;
  folded?: boolean;
  allIn?: boolean;
  hole?: Card[];
}

function mesa(
  semillas: Semilla[],
  parcial: Partial<PokerState> = {},
): PokerState {
  const players = semillas.map((s) => ({
    seat: s.seat,
    name: `P${s.seat}`,
    stack: s.stack,
    betStreet: s.betStreet ?? 0,
    betHand: s.betHand ?? 0,
    folded: s.folded ?? false,
    allIn: s.allIn ?? false,
    hole: s.hole ? [...s.hole] : [],
  }));
  return {
    handId: "test-infoset",
    seed: 42,
    street: "flop",
    button: 0,
    sb: 10,
    bb: 20,
    ante: 0,
    players,
    board: [],
    deck: [],
    pot: players.reduce((acc, p) => acc + p.betHand, 0),
    committed: 0,
    currentBet: 0,
    minRaise: 20,
    lastAggressor: null,
    actingSeat: null,
    ...parcial,
  };
}

describe("infosets", () => {
  it("clave determinista: mismo input produce la misma key", () => {
    const base = mesa(
      [
        { seat: 0, stack: 990, hole: [carta(14, "♥"), carta(13, "♠")] },
        { seat: 1, stack: 980, hole: [carta(12, "♣"), carta(11, "♣")] },
      ],
      {
        street: "flop",
        button: 0,
        board: [carta(13, "♦"), carta(7, "♥"), carta(2, "♠")],
        pot: 120,
        currentBet: 20,
        actingSeat: 0,
        history: ["x", "c20"],
      },
    );
    const info1 = getInformationSet(base, 0);
    const info2 = getInformationSet(base, 0);
    expect(getInformationSetKey(info1)).toBe(getInformationSetKey(info2));
    // Clon idéntico (nuevo objeto) también da la misma key.
    const clon = mesa(
      [
        { seat: 0, stack: 990, hole: [carta(14, "♥"), carta(13, "♠")] },
        { seat: 1, stack: 980, hole: [carta(12, "♣"), carta(11, "♣")] },
      ],
      {
        street: "flop",
        button: 0,
        board: [carta(13, "♦"), carta(7, "♥"), carta(2, "♠")],
        pot: 120,
        currentBet: 20,
        actingSeat: 0,
        history: ["x", "c20"],
      },
    );
    expect(getInformationSetKey(getInformationSet(clon, 0))).toBe(
      getInformationSetKey(info1),
    );
  });

  it("no filtra: solo cambian hole rival y deck, la key es idéntica y el JSON no los contiene", () => {
    const comun = {
      street: "flop" as const,
      button: 0,
      board: [carta(13, "♦"), carta(7, "♥"), carta(2, "♠")],
      pot: 120,
      currentBet: 20,
      minRaise: 20,
      actingSeat: 0,
      history: ["x"] as string[],
    };
    const estadoA = mesa(
      [
        { seat: 0, stack: 990, hole: [carta(14, "♥"), carta(13, "♠")] },
        { seat: 1, stack: 980, hole: [carta(12, "♣"), carta(11, "♣")] },
      ],
      { ...comun, deck: [carta(9, "♣"), carta(8, "♣"), carta(6, "♦")] },
    );
    const estadoB = mesa(
      [
        { seat: 0, stack: 990, hole: [carta(14, "♥"), carta(13, "♠")] },
        { seat: 1, stack: 980, hole: [carta(9, "♣"), carta(8, "♣")] },
      ],
      { ...comun, deck: [carta(12, "♣"), carta(11, "♣"), carta(5, "♥")] },
    );
    const infoA = getInformationSet(estadoA, 0);
    const infoB = getInformationSet(estadoB, 0);
    expect(getInformationSetKey(infoA)).toBe(getInformationSetKey(infoB));
    const jsonA = JSON.stringify(infoA);
    // Héroe (A,K) + board (K,7,2) no usan Q/J ni palos ♣: si aparecen, filtran.
    expect(jsonA).not.toContain('"rank":12');
    expect(jsonA).not.toContain('"rank":11');
    expect(jsonA).not.toContain("♣");
    // El deck nunca forma parte del infoset.
    expect(jsonA).not.toContain("deck");
  });

  it("posiciones HU y 6-max", () => {
    const hu = mesa([{ seat: 0, stack: 1000 }, { seat: 1, stack: 1000 }], {
      button: 0,
    });
    expect(positionOf(hu, 0)).toBe("SB");
    expect(positionOf(hu, 1)).toBe("BB");
    const huBtn1 = mesa([{ seat: 0, stack: 1000 }, { seat: 1, stack: 1000 }], {
      button: 1,
    });
    expect(positionOf(huBtn1, 1)).toBe("SB");
    expect(positionOf(huBtn1, 0)).toBe("BB");

    const seis = mesa(
      [0, 1, 2, 3, 4, 5].map((seat) => ({ seat, stack: 1000 })),
      { button: 0 },
    );
    expect(positionOf(seis, 0)).toBe("BTN");
    expect(positionOf(seis, 1)).toBe("SB");
    expect(positionOf(seis, 2)).toBe("BB");
    expect(positionOf(seis, 3)).toBe("UTG");
    expect(positionOf(seis, 4)).toBe("MP");
    expect(positionOf(seis, 5)).toBe("CO");
  });

  it("toCall y minRaiseTo correctos (incluido tope por stack)", () => {
    const estado = mesa(
      [
        { seat: 0, stack: 900, betStreet: 20, hole: [carta(14, "♥"), carta(13, "♠")] },
        { seat: 1, stack: 800, betStreet: 60, hole: [carta(12, "♣"), carta(11, "♣")] },
      ],
      { street: "flop", currentBet: 60, minRaise: 20, actingSeat: 0 },
    );
    const info = getInformationSet(estado, 0);
    expect(info.toCall).toBe(40);
    // min(currentBet+minRaise=80, betStreetHero+stackHero=920) = 80.
    expect(info.minRaiseTo).toBe(80);

    const corto = mesa(
      [
        { seat: 0, stack: 30, betStreet: 20, hole: [carta(14, "♥"), carta(13, "♠")] },
        { seat: 1, stack: 800, betStreet: 60, hole: [carta(12, "♣"), carta(11, "♣")] },
      ],
      { street: "flop", currentBet: 60, minRaise: 20, actingSeat: 0 },
    );
    // min(80, 20+30=50) = 50 (tope all-in del héroe).
    expect(getInformationSet(corto, 0).minRaiseTo).toBe(50);
  });

  it("historial con tokens tras bet + call + avance de calle", () => {
    const flop = mesa(
      [
        { seat: 0, stack: 1000, hole: [carta(14, "♥"), carta(13, "♠")] },
        { seat: 1, stack: 1000, hole: [carta(12, "♣"), carta(11, "♣")] },
      ],
      {
        street: "flop",
        button: 0,
        board: [carta(13, "♦"), carta(7, "♥"), carta(2, "♠")],
        deck: [carta(9, "♦"), carta(8, "♥"), carta(6, "♠"), carta(5, "♠"), carta(4, "♥")],
        currentBet: 0,
        minRaise: 20,
        actingSeat: 0,
      },
    );
    const trasBet = applyAction(flop, 0, { type: "bet", amount: 20 });
    expect(trasBet.history).toEqual(["b20"]);
    const trasCall = applyAction(trasBet, 1, { type: "call" });
    expect(trasCall.history).toEqual(["b20", "c20"]);
    expect(trasCall.actingSeat).toBeNull();
    const trasAvance = advanceStreet(trasCall, () => 0);
    expect(trasAvance.history).toEqual(["b20", "c20", "/turn"]);
    const info = getInformationSet(trasAvance, 0);
    expect(info.bettingHistory).toEqual(["b20", "c20", "/turn"]);
    expect(getInformationSetKey(info)).toContain("h:b20,c20,/turn");
  });

  it("lanza si el héroe no tiene 2 hole", () => {
    const sinCartas = mesa(
      [
        { seat: 0, stack: 1000, hole: [] },
        { seat: 1, stack: 1000, hole: [carta(12, "♣"), carta(11, "♣")] },
      ],
      { actingSeat: 0 },
    );
    expect(() => getInformationSet(sinCartas, 0)).toThrow();
    const unaCarta = mesa(
      [
        { seat: 0, stack: 1000, hole: [carta(14, "♥")] },
        { seat: 1, stack: 1000, hole: [carta(12, "♣"), carta(11, "♣")] },
      ],
      { actingSeat: 0 },
    );
    expect(() => getInformationSet(unaCarta, 0)).toThrow();
  });
});
