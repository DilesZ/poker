// Tests del almacén global de servidor (KV mockeado vía env vacía → usa caché).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createBrain } from "./brain";
import { __clearGlobalCache, migrateBrain } from "./memory";
import {
  __clearServerCache,
  GLOBAL_BRAIN_KEY,
  TTL_GLOBAL,
  loadGlobalBrainServer,
  mergeAndSaveServer,
  saveGlobalBrainServer,
} from "./globalStore";

const ENVS = [
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
];

let respaldo: Record<string, string | undefined> = {};

beforeEach(() => {
  respaldo = {};
  for (const k of ENVS) {
    respaldo[k] = process.env[k];
    delete process.env[k];
  }
  __clearGlobalCache();
  __clearServerCache();
});

afterEach(() => {
  for (const k of ENVS) {
    if (respaldo[k] === undefined) delete process.env[k];
    else process.env[k] = respaldo[k];
  }
  __clearGlobalCache();
  __clearServerCache();
});

describe("globalStore", () => {
  it("expone clave y TTL esperados", () => {
    expect(GLOBAL_BRAIN_KEY).toBe("agent:global:brain:v3");
    expect(TTL_GLOBAL).toBe(30 * 24 * 3600);
  });

  it("sin KV usa solo caché de proceso", async () => {
    const vacio = await loadGlobalBrainServer();
    expect(vacio).toBeNull();
    const b = createBrain();
    b.handsPlayed = 7;
    b.priors["flop/hasPot/call"] = 0.72;
    expect(await saveGlobalBrainServer(b)).toBe(true);
    const cargado = await loadGlobalBrainServer();
    expect(cargado?.handsPlayed).toBe(7);
    expect(cargado?.priors["flop/hasPot/call"]).toBeCloseTo(0.72, 6);
  });

  it("merge promedia priors y suma manos", async () => {
    const g = createBrain();
    g.handsPlayed = 10;
    g.priors["flop/hasPot/call"] = 0.6;
    await saveGlobalBrainServer(g);
    const room = createBrain();
    room.handsPlayed = 10;
    room.priors["flop/hasPot/call"] = 0.8;
    const merged = await mergeAndSaveServer(room);
    expect(merged.priors["flop/hasPot/call"]).toBeCloseTo(0.7, 6);
    expect(merged.handsPlayed).toBe(20);
    const releido = await loadGlobalBrainServer();
    expect(releido?.handsPlayed).toBe(20);
  });

  it("sin global previo guarda la sala tal cual", async () => {
    const room = createBrain();
    room.handsPlayed = 3;
    room.priors["flop/hasPot/call"] = 0.65;
    const out = await mergeAndSaveServer(room);
    expect(out.handsPlayed).toBe(3);
    expect(out.priors["flop/hasPot/call"]).toBeCloseTo(0.65, 6);
  });

  it("corrupto→base: migrar basura da cerebro base y nunca lanza", async () => {
    expect(migrateBrain(null).handsPlayed).toBe(0);
    expect(migrateBrain({ hola: 1 }).priors["flop/hasPot/call"]).toBe(0.5);
    await expect(loadGlobalBrainServer()).resolves.not.toThrow();
    await expect(saveGlobalBrainServer(createBrain())).resolves.not.toThrow();
  });
});
