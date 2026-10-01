// Tests del motor de salas: ciegas, calles, cierres, turno y reflexión.
import { describe, expect, it } from "vitest";
import { createBrain } from "../agent/brain";
import type { Room } from "./types";
import {
  aplicarAccion,
  calcularActingSeat,
  construirVista,
  estadoDe,
  ejecutarAccion,
  iniciarMano,
  initRoomState,
  minimoJugadores,
  reflejar,
} from "./roomEngine";

function salaPrueba(maxPlayers: number, asientos: number[]): Room {
  const ahora = Date.now();
  return {
    code: "TEST01",
    createdAt: ahora,
    players: asientos.map((seat) => ({
      clientId: `cliente-${seat}`,
      name: `Jugador ${seat}`,
      seat,
      stack: 1000,
      connected: true,
    })),
    withAgent: false,
    maxPlayers,
    agentSeat: -1,
    state: initRoomState(maxPlayers, false),
    version: 1,
    updatedAt: ahora,
    brain: createBrain(),
  };
}

/** 1v1 con agente sentado en el asiento 1 (maxPlayers - 1). */
function salaConAgente(): Room {
  const room = salaPrueba(2, [0]);
  room.withAgent = true;
  room.agentSeat = 1;
  room.players.push({
    clientId: "agente",
    name: "Agente",
    seat: 1,
    stack: 1000,
    connected: true,
  });
  room.state = initRoomState(2, true);
  return room;
}

describe("minimoJugadores", () => {
  it("exige 2 en 1v1 y 3 en mesa abierta", () => {
    expect(minimoJugadores(2)).toBe(2);
    expect(minimoJugadores(3)).toBe(3);
    expect(minimoJugadores(6)).toBe(3);
  });
});

describe("iniciarMano", () => {
  it("reparte, postea las ciegas heads-up y fija el turno del botón", () => {
    const room = salaPrueba(2, [0, 1]);
    iniciarMano(room);
    const e = estadoDe(room);
    expect(e.players).toHaveLength(2);
    expect(e.players.every((p) => p.hole.length === 2)).toBe(true);
    expect(e.street).toBe("preflop");
    expect(e.button).toBe(0);
    expect(e.players[0].bet).toBe(10);
    expect(e.players[1].bet).toBe(20);
    expect(e.pot).toBe(30);
    expect(e.currentBet).toBe(20);
    expect(e.deck).toHaveLength(48);
    expect(calcularActingSeat(e)).toBe(0);
  });

  it("sitúa las ciegas con asientos dispersos en mesa de 3", () => {
    const room = salaPrueba(3, [0, 1, 5]);
    iniciarMano(room);
    const e = estadoDe(room);
    const porAsiento = new Map(e.players.map((p) => [p.id, p]));
    expect(e.button).toBe(0);
    expect(porAsiento.get(1)?.bet).toBe(10);
    expect(porAsiento.get(5)?.bet).toBe(20);
    expect(calcularActingSeat(e)).toBe(0);
  });

  it("no reparte con menos de dos jugadores", () => {
    const room = salaPrueba(2, [0]);
    iniciarMano(room);
    expect(estadoDe(room).players).toHaveLength(0);
    expect(estadoDe(room).street).toBe("done");
    expect(calcularActingSeat(estadoDe(room))).toBeUndefined();
  });
});

describe("aplicarAccion", () => {
  it("call y check cierran la apuesta y avanzan al flop", () => {
    const room = salaPrueba(2, [0, 1]);
    iniciarMano(room);
    const e = estadoDe(room);
    aplicarAccion(e, 0, { type: "call" });
    expect(calcularActingSeat(e)).toBe(1);
    aplicarAccion(e, 1, { type: "check" });
    expect(e.street).toBe("flop");
    expect(e.board).toHaveLength(3);
    expect(e.currentBet).toBe(0);
    expect(calcularActingSeat(e)).toBe(1);
  });

  it("fold termina la mano y entrega el bote al rival", () => {
    const room = salaPrueba(2, [0, 1]);
    iniciarMano(room);
    const e = estadoDe(room);
    aplicarAccion(e, 0, { type: "fold" });
    expect(e.street).toBe("done");
    expect(e.players[1].stack).toBe(1010);
    expect(e.ganadorTexto).toContain("gana 30");
    expect(calcularActingSeat(e)).toBeUndefined();
  });

  it("raise es apuesta total (raise-to) y reinicia el orden de la calle", () => {
    const room = salaPrueba(2, [0, 1]);
    iniciarMano(room);
    const e = estadoDe(room);
    aplicarAccion(e, 0, { type: "raise", size: 100 });
    expect(e.players[0].bet).toBe(100);
    expect(e.currentBet).toBe(100);
    expect(calcularActingSeat(e)).toBe(1);
    aplicarAccion(e, 1, { type: "call" });
    expect(e.players[1].bet).toBe(100);
    expect(e.players[1].stack).toBe(900);
    expect(e.street).toBe("flop");
  });

  it("all-in de ambos corre el showdown hasta el final", () => {
    const room = salaPrueba(2, [0, 1]);
    iniciarMano(room);
    const e = estadoDe(room);
    aplicarAccion(e, 0, { type: "allin" });
    expect(calcularActingSeat(e)).toBe(1);
    aplicarAccion(e, 1, { type: "call" });
    expect(e.street).toBe("done");
    expect(e.showdownFinal).toBe(true);
    expect(e.ganadorTexto).toBeTruthy();
    expect(e.players[0].stack + e.players[1].stack).toBe(2000);
  });
});

describe("ejecutarAccion", () => {
  it("rechaza actuar fuera de turno", () => {
    const room = salaPrueba(2, [0, 1]);
    iniciarMano(room);
    const r = ejecutarAccion(room, 1, { type: "check" });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("No es tu turno.");
  });

  it("no deja repartir con la mano en juego", () => {
    const room = salaPrueba(2, [0, 1]);
    iniciarMano(room);
    const r = ejecutarAccion(room, 0, { type: "nextStreet" });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("La mano sigue en juego.");
  });

  it("nextStreet reparte la mano siguiente cuando la anterior terminó", () => {
    const room = salaPrueba(2, [0, 1]);
    iniciarMano(room);
    aplicarAccion(estadoDe(room), 0, { type: "fold" });
    const r = ejecutarAccion(room, 0, { type: "nextStreet" });
    expect(r.ok).toBe(true);
    expect(r.handOver).toBe(false);
    const e = estadoDe(room);
    expect(e.street).toBe("preflop");
    expect(e.players.every((p) => p.hole.length === 2)).toBe(true);
  });

  it("hace jugar al agente si le toca antes que al humano", () => {
    const room = salaConAgente();
    iniciarMano(room);
    const e = estadoDe(room);
    const r = ejecutarAccion(room, 0, { type: "call" });
    expect(r.ok).toBe(true);
    // El bucle del agente solo termina con la mano cerrada u otro turno encima.
    expect(e.street === "done" || calcularActingSeat(e) !== 1).toBe(true);
  });
});

describe("reflejar", () => {
  it("aprende una sola vez por mano y deja lección legible", () => {
    const room = salaConAgente();
    iniciarMano(room);
    const primero = ejecutarAccion(room, 0, { type: "call" });
    expect(primero.ok).toBe(true);
    const segundo = ejecutarAccion(room, 0, { type: "fold" });
    expect(segundo.ok).toBe(true);
    expect(estadoDe(room).street).toBe("done");
    expect(room.brain.handsPlayed).toBe(1);
    expect(room.lesson).toBeTruthy();
    const manos = room.brain.handsPlayed;
    reflejar(room);
    expect(room.brain.handsPlayed).toBe(manos);
  });
});

describe("construirVista", () => {
  it("oculta el mazo y las cartas ajenas, expone las mías", () => {
    const room = salaPrueba(2, [0, 1]);
    iniciarMano(room);
    const vista = construirVista(room, "cliente-0");
    expect(vista.code).toBe("TEST01");
    expect(vista.state.deck).toEqual([]);
    expect(
      vista.state.players.every(
        (p: { hole: unknown[] }) => p.hole.length === 0,
      ),
    ).toBe(true);
    expect(vista.myHole).toHaveLength(2);
    expect(vista.yourSeat).toBe(0);
    expect(vista.actingSeat).toBe(0);
    expect(vista.handOver).toBe(false);
    expect(vista.version).toBe(1);
  });

  it("refleja el fin de mano con el ganador y el turno vacío", () => {
    const room = salaPrueba(2, [0, 1]);
    iniciarMano(room);
    aplicarAccion(estadoDe(room), 0, { type: "fold" });
    const vista = construirVista(room, "cliente-1");
    expect(vista.handOver).toBe(true);
    expect(vista.actingSeat).toBeUndefined();
    expect(vista.winnerText).toContain("gana 30");
  });
});
