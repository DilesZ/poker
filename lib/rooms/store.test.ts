// Tests de la fachada de persistencia: memoria, CAS por versión y rechazos.
import { beforeEach, describe, expect, it } from "vitest";
import { createBrain } from "../agent/brain";
import { initRoomState } from "./roomEngine";
import { memoriaEscribir, memoriaLeer, memoriaLimpiar } from "./memory";
import { actualizarSala, cargarSala, modificarSala } from "./store";
import type { Room } from "./types";

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

describe("memoria", () => {
  it("guarda y devuelve una copia aislada", () => {
    const room = roomEjemplo();
    memoriaEscribir(room);
    const leido = memoriaLeer("MEM001");
    expect(leido).not.toBeNull();
    expect(leido?.version).toBe(1);
    leido!.version = 99;
    expect(memoriaLeer("MEM001")?.version).toBe(1);
  });

  it("devuelve null para un código desconocido", () => {
    expect(memoriaLeer("NADA00")).toBeNull();
  });
});

describe("modificarSala", () => {
  it("aplica el mutador y sube la versión", async () => {
    memoriaEscribir(roomEjemplo());
    const r = await modificarSala("MEM001", (room) => {
      room.players.push({
        clientId: "x",
        name: "Ana",
        seat: 0,
        stack: 1000,
        connected: true,
      });
      return room;
    });
    expect(r.estado).toBe("ok");
    if (r.estado !== "ok") throw new Error("rama inalcanzable");
    expect(r.room.version).toBe(2);
    expect((await cargarSala("MEM001"))?.version).toBe(2);
  });

  it("devuelve sin-sala para códigos inexistentes", async () => {
    const r = await modificarSala("FALTA0", (room) => room);
    expect(r.estado).toBe("sin-sala");
  });

  it("devuelve rechazado si el mutador devuelve null", async () => {
    memoriaEscribir(roomEjemplo());
    const r = await modificarSala("MEM001", () => null);
    expect(r.estado).toBe("rechazado");
    expect((await cargarSala("MEM001"))?.version).toBe(1);
  });
});

describe("actualizarSala", () => {
  it("aplica con la versión esperada y sella la nueva", async () => {
    memoriaEscribir(roomEjemplo());
    const r = await actualizarSala("MEM001", 1, (room) => room);
    expect(r.estado).toBe("ok");
    if (r.estado !== "ok") throw new Error("rama inalcanzable");
    expect(r.room.version).toBe(2);
  });

  it("recarga y reintenta si la versión cambió entre lectura y escritura", async () => {
    memoriaEscribir(roomEjemplo());
    const r = await actualizarSala("MEM001", 0, (room) => room);
    expect(r.estado).toBe("ok");
    if (r.estado !== "ok") throw new Error("rama inalcanzable");
    expect(r.room.version).toBe(2);
  });

  it("devuelve conflicto si se agotan los reintentos", async () => {
    memoriaEscribir(roomEjemplo());
    const r = await actualizarSala("MEM001", 999, (room) => room, 1);
    expect(r.estado).toBe("conflicto");
    expect((await cargarSala("MEM001"))?.version).toBe(1);
  });

  it("devuelve sin-sala para códigos inexistentes", async () => {
    const r = await actualizarSala("FALTA0", 1, (room) => room);
    expect(r.estado).toBe("sin-sala");
  });
});
