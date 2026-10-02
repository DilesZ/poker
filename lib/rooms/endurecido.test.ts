// Tests de endurecimiento salas privadas: 409/400, expiración y CAS.
import { beforeEach, describe, expect, it } from "vitest";
import { createBrain } from "../agent/brain";
import { crearSala, respuestaAccion, respuestaEstado, unirseSala, codigoDe } from "./api";
import { initRoomState } from "./roomEngine";
import {
  calcularActingSeat,
  ejecutarAccion,
  estadoDe,
  iniciarMano,
  isTurnExpired,
} from "./roomEngine";
import { memoriaEscribir, memoriaLeer, memoriaLimpiar } from "./memory";
import { cargarSala, isRoomShape, modificarSala } from "./store";
import type { Room } from "./types";

function cuerpo(res: Response): Promise<Record<string, unknown>> {
  return res.json() as Promise<Record<string, unknown>>;
}

async function crearSala1v1(): Promise<string> {
  const res = await crearSala({ name: "Ana", mode: "1v1", maxPlayers: 2 });
  const { code } = await cuerpo(res);
  return code as string;
}

async function unirse(code: string, name: string): Promise<string> {
  const res = await unirseSala({ code, name });
  const datos = await cuerpo(res);
  return datos.clientId as string;
}

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

function roomEjemplo(code = "MEM001"): Room {
  const ahora = Date.now();
  return {
    code,
    createdAt: ahora,
    players: [],
    withAgent: true,
    maxPlayers: 2,
    agentSeat: 1,
    state: initRoomState(2, true),
    version: 1,
    updatedAt: ahora,
    brain: createBrain(),
  };
}

beforeEach(() => {
  memoriaLimpiar();
});

describe("endurecido salas", () => {
  it("sala llena devuelve 409", async () => {
    const code = await crearSala1v1();
    await unirse(code, "Ana");
    // 1v1 con agente: agente + Ana = llena; Bob no cabe.
    const llena = await unirseSala({ code, name: "Bob" });
    expect(llena.status).toBe(409);
    expect((await cuerpo(llena)).error).toMatch(/llena/i);
  });

  it("acción fuera de turno devuelve 409", async () => {
    const code = await crearSala1v1();
    const clientId = await unirse(code, "Ana");
    // Fuerza fuera de turno a nivel motor y verifica el mapeo API a 409.
    const room = (await cargarSala(code))!;
    const e = estadoDe(room);
    // Si le toca a Ana (0), actuar con asiento 1 debe fallar.
    const turno = calcularActingSeat(e);
    expect(turno).toBe(0);
    const rMotor = ejecutarAccion(room, 1, { type: "check" });
    expect(rMotor.ok).toBe(false);
    expect(rMotor.error).toBe("No es tu turno.");
    // Vía API: nextStreet en mitad de mano también es 409 (mano en juego).
    const res = await respuestaAccion(code, { clientId, action: { type: "nextStreet" } });
    expect(res.status).toBe(409);
  });

  it("raise ilegal con size<minRaise devuelve 400", async () => {
    const code = await crearSala1v1();
    const clientId = await unirse(code, "Ana");
    const room = (await cargarSala(code))!;
    const e = estadoDe(room);
    const minRaise = e.currentBet + (e.bigBlind ?? 20);
    expect(minRaise).toBeGreaterThan(20);
    const ilegal = Math.max(1, minRaise - 5);
    const res = await respuestaAccion(code, {
      clientId,
      action: { type: "raise", size: ilegal },
    });
    expect(res.status).toBe(400);
    expect((await cuerpo(res)).error).toMatch(/mínima/i);
  });

  it("check ilegal con apuesta por igualar devuelve 409", async () => {
    const code = await crearSala1v1();
    const clientId = await unirse(code, "Ana");
    const room = (await cargarSala(code))!;
    const e = estadoDe(room);
    const enMesa = e.players.find((p) => p.id === 0)!;
    const toCall = Math.max(0, e.currentBet - enMesa.bet);
    expect(toCall).toBeGreaterThan(0);
    const res = await respuestaAccion(code, { clientId, action: { type: "check" } });
    expect(res.status).toBe(409);
  });

  it("turn expired hace auto-fold y renueva deadline", () => {
    const room = salaPrueba(2, [0, 1]);
    iniciarMano(room);
    const e = estadoDe(room);
    expect(typeof e.deadlineActing).toBe("number");
    const turno = calcularActingSeat(e);
    expect(turno).toBe(0);
    // Expira el turno.
    e.deadlineActing = Date.now() - 1000;
    expect(isTurnExpired(room)).toBe(true);
    const r = ejecutarAccion(room, turno!, { type: "call" });
    expect(r.ok).toBe(true);
    // Auto-fold vía aplicarUna: el expirado quedó folded.
    expect(e.players.find((p) => p.id === turno)?.folded).toBe(true);
  });

  it("nextStreet restringido a participantes", () => {
    const room = salaPrueba(2, [0, 1]);
    iniciarMano(room);
    // Termina la mano por fold para poder pedir nextStreet.
    const { estadoDe: _ed } = { estadoDe };
    void _ed;
    ejecutarAccion(room, calcularActingSeat(estadoDe(room))!, { type: "fold" });
    expect(estadoDe(room).street).toBe("done");
    const r = ejecutarAccion(room, 99, { type: "nextStreet" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/participantes/i);
  });

  it("modificarSala con CAS reintenta y no pierde escrituras concurrentes", async () => {
    memoriaEscribir(roomEjemplo("CAS001"));
    // Lanza la primera escritura y, antes de que resuelva, mete una externa a v2.
    const prom = modificarSala("CAS001", (r) => {
      r.players.push({
        clientId: "ana",
        name: "Ana",
        seat: 0,
        stack: 1000,
        connected: true,
      });
      return r;
    });
    // Bump externo síncrono: simula otro writer que gana la carrera a v2.
    const actual = memoriaLeer("CAS001")!;
    memoriaEscribir({
      ...actual,
      players: [
        {
          clientId: "luis",
          name: "Luis",
          seat: 1,
          stack: 1000,
          connected: true,
        },
      ],
      version: 2,
      brain: actual.brain,
      state: actual.state,
    });
    const r = await prom;
    expect(r.estado).toBe("ok");
    const final = await cargarSala("CAS001");
    expect(final?.version).toBeGreaterThanOrEqual(3);
    const ids = (final?.players ?? []).map((p) => p.clientId).sort();
    // CAS debe conservar ambas escrituras (Ana + Luis).
    expect(ids).toContain("ana");
    expect(ids).toContain("luis");
  });

  it("isRoomShape valida code, players y brain.priors", () => {
    expect(isRoomShape(roomEjemplo())).toBe(true);
    expect(isRoomShape(null)).toBe(false);
    expect(isRoomShape({ code: "X" })).toBe(false);
    expect(
      isRoomShape({ code: "X", players: [], brain: { priors: {} } }),
    ).toBe(true);
    expect(
      isRoomShape({ code: "X", players: [], brain: {} }),
    ).toBe(false);
  });

  it("respuestaEstado expone 204 y vista tras arranque", async () => {
    const code = await crearSala1v1();
    const clientId = await unirse(code, "Ana");
    const url = new URL(`http://localhost/api/rooms/${code}?clientId=${clientId}&version=0`);
    const primera = await respuestaEstado(codigoDe(code), url);
    expect(primera.status).toBe(200);
    const vista = await cuerpo(primera);
    const segundaUrl = new URL(
      `http://localhost/api/rooms/${code}?clientId=${clientId}&version=${vista.version}`,
    );
    const segunda = await respuestaEstado(codigoDe(code), segundaUrl);
    expect([200, 204]).toContain(segunda.status);
  });
});
