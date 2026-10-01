// Tests del formato REST de Upstash (mock de fetch): SET por array de comando
// en la raíz y GET interpretando {result}. Cubre también el formato legado.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Room } from "./types";
import { kvEscribir, kvLeer } from "./kv";

const ROOM = {
  code: "TEST1",
  createdAt: 1,
  players: [],
  withAgent: true,
  maxPlayers: 2,
  agentSeat: 1,
  state: {},
  version: 3,
  updatedAt: 1,
  brain: { handsPlayed: 0, lessons: [], priors: {}, beliefs: [], epsilon: 0.9 },
} as unknown as Room;

function envConKV() {
  process.env.KV_REST_API_URL = "https://fake.upstash.io";
  process.env.KV_REST_API_TOKEN = "tok";
}

afterEach(() => {
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  vi.unstubAllGlobals();
});

describe("kv formato Upstash", () => {
  it("escribe con SET completo en la raíz (con EX)", async () => {
    envConKV();
    const spy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ result: "OK" })),
    );
    vi.stubGlobal("fetch", spy);
    expect(await kvEscribir(ROOM)).toBe(true);
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://fake.upstash.io/");
    const args = JSON.parse(String(init.body)) as unknown[];
    expect(args[0]).toBe("SET");
    expect(args[1]).toBe("room:TEST1");
    expect(args[3]).toBe("EX");
    expect(JSON.parse(String(args[2]) as string)).toMatchObject({
      code: "TEST1",
      version: 3,
    });
  });

  it("lee interpretando {result} con la sala ya parseada", async () => {
    envConKV();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ result: JSON.stringify(ROOM) })),
      ),
    );
    const room = await kvLeer("TEST1");
    expect(room?.code).toBe("TEST1");
    expect(room?.version).toBe(3);
  });

  it("lee el formato legado (array con string dentro)", async () => {
    envConKV();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ result: JSON.stringify([JSON.stringify(ROOM)]) }),
        ),
      ),
    );
    const room = await kvLeer("TEST1");
    expect(room?.code).toBe("TEST1");
  });

  it("devuelve null en respuesta ilegible", async () => {
    envConKV();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ result: 42 }))),
    );
    expect(await kvLeer("TEST1")).toBeNull();
  });
});
