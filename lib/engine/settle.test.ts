// Tests de liquidación: avance de calles, botes laterales, devoluciones,
// showdown, bote no disputado y conservación de fichas.
import { describe, expect, it } from "vitest";
import type { Card } from "@/lib/poker/types";
import type { EngineAction, EnginePlayer, PokerState } from "@/lib/engine/types";
import { applyAction, getLegalActions } from "@/lib/engine/betting";
import {
  advanceStreet,
  awardUncontested,
  buildSidePots,
  refundUncalled,
  settleShowdown,
  verifyConservation,
} from "./settle";

// ---------------------------------------------------------------------------
// Ayudas
// ---------------------------------------------------------------------------

type Palo = Card["suit"];
type Rango = Card["rank"];

const carta = (rank: Rango, suit: Palo): Card => ({ rank, suit });

function jugador(seat: number, stack: number, extra: Partial<EnginePlayer> = {}): EnginePlayer {
  return {
    seat,
    name: `J${seat}`,
    stack,
    betStreet: 0,
    betHand: 0,
    folded: false,
    allIn: false,
    hole: [],
    ...extra,
  };
}

function estado(base: Partial<PokerState> & { players: EnginePlayer[] }): PokerState {
  return {
    handId: "test",
    seed: 1,
    street: "preflop",
    button: 0,
    sb: 10,
    bb: 20,
    ante: 0,
    board: [],
    deck: [],
    pot: 0,
    committed: 0,
    currentBet: 0,
    minRaise: 20,
    lastAggressor: null,
    actingSeat: null,
    ...base,
  };
}

function mazoCompleto(): Card[] {
  const palos: Palo[] = ["♠", "♥", "♦", "♣"];
  const mazo: Card[] = [];
  for (const s of palos) {
    for (let r = 2; r <= 14; r++) mazo.push({ rank: r as Rango, suit: s });
  }
  return mazo;
}

/** PRNG determinista (mulberry32) para el driver. */
function mulberry32(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Driver propio: mano 4-handed con baraja barajada por semilla, ciegas
 * posteadas y acción aleatoria entre las legales hasta "done".
 * NOTA: `getLegalActions`/`applyAction` los escribe otro agente en
 * `lib/engine/betting`; si su firma difiere, ajustar solo estas llamadas.
 */
function manoAleatoria(semilla: number): PokerState {
  const rng = mulberry32(semilla);
  const mazo = mazoCompleto();
  for (let i = mazo.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = mazo[i]!;
    mazo[i] = mazo[j]!;
    mazo[j] = a;
  }
  const jugadores = [jugador(0, 1000), jugador(1, 1000), jugador(2, 1000), jugador(3, 1000)];
  for (const p of jugadores) p.hole = [mazo.pop()!, mazo.pop()!];
  // Ciegas: SB asiento 1 (10), BB asiento 2 (20). Preflop actúa el 3.
  jugadores[1]!.stack -= 10;
  jugadores[1]!.betStreet = 10;
  jugadores[1]!.betHand = 10;
  jugadores[2]!.stack -= 20;
  jugadores[2]!.betStreet = 20;
  jugadores[2]!.betHand = 20;
  const total = 4000;
  let s = estado({
    handId: `mano-${semilla}`,
    seed: semilla,
    players: jugadores,
    deck: mazo,
    button: 0,
    currentBet: 20,
    minRaise: 20,
    lastAggressor: 2,
    actingSeat: 3,
    pot: 30, // invariante: pot == ΣbetHand (10 SB + 20 BB)
  });
  verifyConservation(s, total);
  let pasos = 0;
  while (s.street !== "done") {
    if (++pasos > 5000) throw new Error(`mano ${semilla}: bucle sin cerrar`);
    if (s.actingSeat == null) {
      const live = s.players.filter((p) => !p.folded);
      if (live.length <= 1) s = awardUncontested(s);
      else if (s.street === "showdown") s = settleShowdown(s);
      else s = advanceStreet(s, rng);
    } else {
      const seat = s.actingSeat as number;
      const legales = getLegalActions(s, seat);
      const candidatas: EngineAction[] = [];
      if (legales.canFold) candidatas.push({ type: "fold" });
      if (legales.canCheck) candidatas.push({ type: "check" });
      if (legales.canCall) candidatas.push({ type: "call" });
      if (legales.canBet) {
        candidatas.push({
          type: "bet",
          amount:
            legales.betMin + Math.floor(rng() * (legales.betMax - legales.betMin + 1)),
        });
      }
      if (legales.canRaise) {
        candidatas.push({
          type: "raise",
          to:
            legales.raiseToMin +
            Math.floor(rng() * (legales.raiseToMax - legales.raiseToMin + 1)),
        });
      }
      if (legales.canAllIn) candidatas.push({ type: "allin" });
      expect(candidatas.length, `mano ${semilla}: sin acciones legales`).toBeGreaterThan(0);
      const elegida = candidatas[Math.floor(rng() * candidatas.length)]!;
      s = applyAction(s, seat, elegida);
    }
    verifyConservation(s, total);
  }
  return s;
}

// ---------------------------------------------------------------------------
// Tests (10)
// ---------------------------------------------------------------------------

describe("settle", () => {
  it("1. conserva fichas en una mano aleatoria completa (20 seeds)", () => {
    for (let semilla = 1; semilla <= 20; semilla++) {
      const fin = manoAleatoria(semilla);
      expect(fin.street).toBe("done");
      expect(fin.pot).toBe(0);
      expect(fin.players.every((p) => p.betHand === 0)).toBe(true);
      const enStacks = fin.players.reduce((acc, p) => acc + p.stack, 0);
      expect(enStacks).toBe(4000);
      verifyConservation(fin, 4000);
    }
  });

  it("2. construye el side pot clásico (A all-in 100, B/C siguen a 400)", () => {
    const s = estado({
      street: "river",
      actingSeat: null,
      players: [
        jugador(0, 0, { betHand: 100, betStreet: 0, allIn: true }),
        jugador(1, 600, { betHand: 400, betStreet: 300 }),
        jugador(2, 600, { betHand: 400, betStreet: 300 }),
      ],
    });
    expect(buildSidePots(s)).toEqual([
      { amount: 300, eligible: [0, 1, 2] },
      { amount: 600, eligible: [1, 2] },
    ]);
  });

  it("3. devuelve la apuesta no igualada (raise 1000, tope ajeno 200 → 800)", () => {
    const s = estado({
      street: "showdown",
      board: [carta(2, "♣"), carta(3, "♦"), carta(5, "♥"), carta(9, "♠"), carta(13, "♦")],
      players: [
        jugador(0, 500, { betHand: 1000, hole: [carta(14, "♠"), carta(14, "♣")] }),
        jugador(1, 800, { betHand: 200, hole: [carta(7, "♣"), carta(8, "♣")] }),
        jugador(2, 0, { betHand: 200, allIn: true, hole: [carta(4, "♠"), carta(6, "♥")] }),
      ],
    });
    const { state: tras, refunded } = refundUncalled(s);
    expect(refunded).toEqual([{ seat: 0, amount: 800 }]);
    expect(tras.players[0]).toMatchObject({ stack: 1300, betHand: 200 });
    expect(tras.pot).toBe(600); // invariante: pot == ΣbetHand tras devolver
    // Inmutable: el original no cambia.
    expect(s.players[0]).toMatchObject({ stack: 500, betHand: 1000 });
    // Tras la devolución queda un único bote de 600 entre los tres.
    expect(buildSidePots(tras)).toEqual([{ amount: 600, eligible: [0, 1, 2] }]);
  });

  it("4. settleShowdown premia la mejor mano de 7 cartas", () => {
    const s = estado({
      street: "showdown",
      actingSeat: null,
      button: 1,
      board: [carta(2, "♣"), carta(3, "♦"), carta(5, "♥"), carta(9, "♠"), carta(13, "♦")],
      pot: 200, // invariante: pot == ΣbetHand
      players: [
        jugador(0, 900, { betHand: 100, hole: [carta(14, "♠"), carta(14, "♣")] }),
        jugador(1, 900, { betHand: 100, hole: [carta(7, "♣"), carta(8, "♣")] }),
      ],
    });
    const fin = settleShowdown(s);
    expect(fin.street).toBe("done");
    expect(fin.winners).toEqual([0]);
    expect(fin.players[0]!.stack).toBe(1100);
    expect(fin.players[1]!.stack).toBe(900);
    expect(fin.pot).toBe(0);
    verifyConservation(fin, 2000);
  });

  it("5. reparte a partes iguales el empate a 3 (escalera real en mesa)", () => {
    const mesa: Card[] = [carta(10, "♥"), carta(11, "♥"), carta(12, "♥"), carta(13, "♥"), carta(14, "♥")];
    const s = estado({
      street: "showdown",
      actingSeat: null,
      button: 0,
      board: mesa,
      pot: 300, // invariante: pot == ΣbetHand
      players: [
        jugador(0, 900, { betHand: 100, hole: [carta(2, "♣"), carta(3, "♦")] }),
        jugador(1, 900, { betHand: 100, hole: [carta(7, "♣"), carta(8, "♣")] }),
        jugador(2, 900, { betHand: 100, hole: [carta(4, "♠"), carta(6, "♥")] }),
      ],
    });
    const fin = settleShowdown(s);
    expect(fin.winners).toHaveLength(3);
    expect(fin.players.map((p) => p.stack)).toEqual([1000, 1000, 1000]);
    verifyConservation(fin, 3000);
  });

  it("6. la odd chip va al ganador más cercano a la izquierda del button", () => {
    // Mesa K♠K♥Q♦J♣8♥ (sin color ni escalera posible con estas holes):
    // asientos 0 y 1 empatan con pareja de K + AQJ; el 2 pierde (K + QJ8).
    // Apuestas [60,60,41] → bote principal 123 (elegibles 0,1,2) + lateral 38
    // (elegibles 0,1). Principal: 123/2 = 61 resto 1 → odd chip al 0
    // (izquierda del button 2: orden [0,1]). Lateral: 38/2 = 19 exacto.
    const s = estado({
      street: "showdown",
      actingSeat: null,
      button: 2,
      board: [carta(13, "♠"), carta(13, "♥"), carta(12, "♦"), carta(11, "♣"), carta(8, "♥")],
      pot: 161, // invariante: pot == ΣbetHand (60+60+41)
      players: [
        jugador(0, 940, { betHand: 60, hole: [carta(14, "♦"), carta(2, "♣")] }),
        jugador(1, 940, { betHand: 60, hole: [carta(14, "♥"), carta(3, "♦")] }),
        jugador(2, 959, { betHand: 41, hole: [carta(7, "♣"), carta(2, "♦")] }),
      ],
    });
    const fin = settleShowdown(s);
    // 0: 940 + 62 + 19 = 1021 · 1: 940 + 61 + 19 = 1020 · 2: 959.
    expect(fin.players.map((p) => p.stack)).toEqual([1021, 1020, 959]);
    expect(fin.winners).toEqual([0, 1]);
    expect(fin.pot).toBe(0);
    verifyConservation(fin, 3000);
  });

  it("7. awardUncontested acredita el bote al único vivo", () => {
    const s = estado({
      street: "turn",
      actingSeat: null,
      pot: 150, // invariante: pot == ΣbetHand (60+50+40)
      players: [
        jugador(0, 940, { betHand: 60, folded: true }),
        jugador(1, 800, { betHand: 50 }),
        jugador(2, 960, { betHand: 40, folded: true }),
      ],
    });
    const fin = awardUncontested(s);
    expect(fin.street).toBe("done");
    expect(fin.winners).toEqual([1]);
    expect(fin.players[1]!.stack).toBe(800 + 150);
    expect(fin.players[0]!.stack).toBe(940);
    expect(fin.players[2]!.stack).toBe(960);
    expect(fin.pot).toBe(0);
    expect(fin.players.every((p) => p.betHand === 0 && p.betStreet === 0)).toBe(true);
    verifyConservation(fin, 2850); // 940+800+960 + 150
  });

  it("8. advanceStreet lanza si el deck no cubre quema+reparto", () => {
    const base = estado({
      players: [jugador(0, 1000), jugador(1, 1000)],
    });
    expect(() => advanceStreet({ ...base, deck: [carta(2, "♣"), carta(3, "♦"), carta(5, "♥")] }, mulberry32(1))).toThrow(
      /deck insuficiente/,
    );
    expect(() =>
      advanceStreet(
        { ...base, street: "flop", deck: [carta(2, "♣")], board: [carta(2, "♠"), carta(3, "♦"), carta(5, "♥")] },
        mulberry32(1),
      ),
    ).toThrow(/deck insuficiente/);
  });

  it("9. el runout con todos all-in avanza sin actingSeat hasta showdown", () => {
    const rng = mulberry32(7);
    let s = estado({
      players: [
        jugador(0, 0, { betHand: 100, allIn: true, hole: [carta(14, "♠"), carta(14, "♣")] }),
        jugador(1, 0, { betHand: 300, allIn: true, hole: [carta(7, "♣"), carta(8, "♣")] }),
        jugador(2, 0, { betHand: 300, allIn: true, hole: [carta(4, "♠"), carta(6, "♥")] }),
      ],
      deck: mazoCompleto(),
    });
    s = advanceStreet(s, rng);
    expect(s.street).toBe("flop");
    expect(s.board).toHaveLength(3);
    expect(s.actingSeat).toBeNull();
    s = advanceStreet(s, rng);
    expect(s.street).toBe("turn");
    expect(s.board).toHaveLength(4);
    expect(s.actingSeat).toBeNull();
    s = advanceStreet(s, rng);
    expect(s.street).toBe("river");
    expect(s.board).toHaveLength(5);
    expect(s.actingSeat).toBeNull();
    s = advanceStreet(s, rng);
    expect(s.street).toBe("showdown");
    expect(s.actingSeat).toBeNull();
    const fin = settleShowdown(s);
    expect(fin.street).toBe("done");
    verifyConservation(fin, 700);
  });

  it("10. valida precondiciones y conservación", () => {
    const dos = [jugador(0, 1000), jugador(1, 1000)];
    // Calle no cerrada.
    expect(() => advanceStreet(estado({ players: dos, actingSeat: 0 }), mulberry32(1))).toThrow(/cerrada/);
    // Un solo vivo.
    expect(() =>
      advanceStreet(estado({ players: [jugador(0, 1000), jugador(1, 1000, { folded: true })] }), mulberry32(1)),
    ).toThrow(/2 jugadores/);
    // Showdown en calle incorrecta y con board incompleto.
    const rio = estado({
      street: "river",
      board: [carta(2, "♣"), carta(3, "♦"), carta(5, "♥"), carta(9, "♠"), carta(13, "♦")],
      players: dos,
    });
    expect(() => settleShowdown(rio)).toThrow(/showdown/);
    expect(() => settleShowdown({ ...rio, street: "showdown", board: rio.board.slice(0, 4) })).toThrow(/5 cartas/);
    // Bote disputado entre dos no es "uncontested".
    expect(() => awardUncontested(estado({ players: dos }))).toThrow(/único/);
    // Conservación descuadrada.
    expect(() => verifyConservation(estado({ players: dos }), 999)).toThrow(/conservación/);
  });
});
