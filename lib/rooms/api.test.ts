// Tests de contrato de la API de salas: crear, unir, leer, actuar y salir.
import { describe, expect, it } from "vitest";
import { codigoDe, crearSala, respuestaAccion, respuestaEstado, respuestaSalir, unirseSala } from "./api";

function cuerpo(res: Response): Promise<Record<string, unknown>> {
  return res.json() as Promise<Record<string, unknown>>;
}

async function crearSalaDePrueba(): Promise<string> {
  const res = await crearSala({ name: "Ana", mode: "1v1", maxPlayers: 2 });
  expect(res.status).toBe(200);
  const { code } = await cuerpo(res);
  expect(typeof code).toBe("string");
  return code as string;
}

async function unirse(code: string, name: string): Promise<string> {
  const res = await unirseSala({ code, name });
  expect(res.status).toBe(200);
  const datos = await cuerpo(res);
  expect(typeof datos.clientId).toBe("string");
  expect(datos.name).toBe(name);
  return datos.clientId as string;
}

async function estado(code: string, clientId: string, version: number): Promise<Response> {
  const url = new URL(
    `http://localhost/api/rooms/${code}?clientId=${clientId}&version=${version}`,
  );
  return respuestaEstado(codigoDe(code), url);
}

describe("crearSala", () => {
  it("devuelve un código de 6 caracteres con el agente sentado", async () => {
    const code = await crearSalaDePrueba();
    expect(code).toMatch(/^[A-Z0-9]{6}$/);
    const res = await respuestaEstado(code, new URL("http://localhost/x"));
    expect(res.status).toBe(200);
    const vista = await cuerpo(res);
    const jugadores = vista.players as Array<{ clientId: string; seat: number }>;
    expect(jugadores).toHaveLength(1);
    expect(jugadores[0]?.clientId).toBe("agente");
    expect(jugadores[0]?.seat).toBe(1);
  });

  it("rechaza datos inválidos", async () => {
    expect((await crearSala(null)).status).toBe(400);
    expect((await crearSala({ name: "Ana", mode: "otro", maxPlayers: 2 })).status).toBe(400);
    expect((await crearSala({ name: "  ", mode: "1v1", maxPlayers: 2 })).status).toBe(400);
  });
});

describe("unirseSala", () => {
  it("sienta al primer humano en el asiento 0 y arranca la mano", async () => {
    const code = await crearSalaDePrueba();
    const clientId = await unirse(code, "Ana");
    const res = await estado(code, clientId, 0);
    expect(res.status).toBe(200);
    const vista = await cuerpo(res);
    expect(vista.yourSeat).toBe(0);
    expect(vista.handOver).toBe(false);
    const state = vista.state as { street: string; players: unknown[] };
    expect(state.street).toBe("preflop");
    expect(state.players).toHaveLength(2);
    expect(vista.actingSeat).toBe(0);
  });

  it("devuelve 404 para una sala inexistente", async () => {
    const res = await unirseSala({ code: "NUNCA0", name: "Ana" });
    expect(res.status).toBe(404);
  });
});

describe("respuestaEstado", () => {
  it("devuelve 204 cuando la versión pedida sigue vigente", async () => {
    const code = await crearSalaDePrueba();
    const clientId = await unirse(code, "Ana");
    const primera = await estado(code, clientId, 0);
    expect(primera.status).toBe(200);
    const vista = await cuerpo(primera);
    const segunda = await estado(code, clientId, vista.version as number);
    expect(segunda.status).toBe(204);
  });

  it("devuelve 404 para un código desconocido", async () => {
    const res = await estado("ZZZZZZ", "nadie", 0);
    expect(res.status).toBe(404);
  });
});

describe("respuestaAccion", () => {
  it("aplica la acción del humano y devuelve la vista actualizada", async () => {
    const code = await crearSalaDePrueba();
    const clientId = await unirse(code, "Ana");
    const res = await respuestaAccion(code, { clientId, action: { type: "call" } });
    expect(res.status).toBe(200);
    const vista = await cuerpo(res);
    expect(vista.version).toBeGreaterThan(1);
    const state = vista.state as { street: string; currentBet: number };
    expect(["preflop", "flop", "turn", "river", "showdown", "done"]).toContain(
      state.street,
    );
  });

  it("rechaza a quien no está en la sala", async () => {
    const code = await crearSalaDePrueba();
    await unirse(code, "Ana");
    const res = await respuestaAccion(code, {
      clientId: "invasor",
      action: { type: "fold" },
    });
    expect(res.status).toBe(404);
  });

  it("rechaza acciones mal formadas", async () => {
    const code = await crearSalaDePrueba();
    const clientId = await unirse(code, "Ana");
    const mala = await respuestaAccion(code, { clientId, action: { type: "volado" } });
    expect(mala.status).toBe(400);
    const sinId = await respuestaAccion(code, { action: { type: "fold" } });
    expect(sinId.status).toBe(400);
  });
});

describe("respuestaSalir", () => {
  it("retira al jugador y deja la sala sin él", async () => {
    const code = await crearSalaDePrueba();
    const clientId = await unirse(code, "Ana");
    const res = await respuestaSalir(code, { clientId });
    expect(res.status).toBe(200);
    expect(await cuerpo(res)).toEqual({ ok: true });
    const tras = await estado(code, clientId, 0);
    expect(tras.status).toBe(200);
    const vista = await cuerpo(tras);
    const jugadores = vista.players as Array<{ clientId: string }>;
    expect(jugadores.some((p) => p.clientId === clientId)).toBe(false);
    expect(jugadores.some((p) => p.clientId === "agente")).toBe(true);
  });

  it("no deja sacar al agente ni a desconocidos", async () => {
    const code = await crearSalaDePrueba();
    const agente = await respuestaSalir(code, { clientId: "agente" });
    expect(agente.status).toBe(403);
    const desconocido = await respuestaSalir(code, { clientId: "nadie" });
    expect(desconocido.status).toBe(404);
  });
});
