// scripts/evaluate.test.ts — Tests del CLI de evaluación heads-up (español).
import { describe, expect, it } from "vitest";
import { formatTable, parseArgs } from "./evaluate";
import { BASELINES } from "../lib/baselines/agent";
import { playMatch } from "../lib/eval/match";

type Agente = Parameters<typeof playMatch>[0];
type Resultado = Awaited<ReturnType<typeof playMatch>>;

/** Recupera un baseline por id tolerando Record, Array o Map. */
function agentePorId(id: string): Agente {
  const b: unknown = BASELINES;
  if (Array.isArray(b)) {
    const hallado = (b as Array<{ id?: unknown }>).find((e) => e?.id === id);
    if (hallado !== undefined) return hallado as unknown as Agente;
  } else if (b instanceof Map) {
    const mapa = b as Map<unknown, unknown>;
    if (mapa.has(id)) return mapa.get(id) as Agente;
  } else if (b !== null && typeof b === "object") {
    const reg = b as Record<string, unknown>;
    if (reg[id] !== undefined) return reg[id] as Agente;
  }
  throw new Error(`Baseline no encontrado en test: "${id}".`);
}

describe("scripts/evaluate", () => {
  it("1. parseArgs: defaults sensatos y flags", () => {
    const d = parseArgs([]);
    expect(d.a).toBe("tag");
    expect(d.b).toBe("random");
    expect(d.hands).toBe(10000);
    expect(d.seed).toBe(7);
    expect(d.stack).toBe(1000);
    expect(d.sb).toBe(10);
    expect(d.bb).toBe(20);
    expect(d.json).toBe(false);

    const f = parseArgs([
      "--a",
      "random",
      "--b",
      "nit",
      "--hands",
      "50",
      "--seed",
      "1",
      "--stack",
      "500",
      "--sb",
      "5",
      "--bb",
      "10",
      "--json",
    ]);
    expect(f.a).toBe("random");
    expect(f.b).toBe("nit");
    expect(f.hands).toBe(50);
    expect(f.seed).toBe(1);
    expect(f.stack).toBe(500);
    expect(f.sb).toBe(5);
    expect(f.bb).toBe(10);
    expect(f.json).toBe(true);
  });

  it("2. parseArgs: id inválido lanza error claro", () => {
    expect(() => parseArgs(["--a", "no-existe", "--b", "random"])).toThrow(
      /Baseline desconocido|Disponibles/i,
    );
    expect(() => parseArgs(["--a", "tag", "--b", "tampoco-existe"])).toThrow(
      /Baseline desconocido|Disponibles/i,
    );
  });

  it("3. formatTable contiene bb/100 e IC95", () => {
    const falso = {
      hands: 100,
      seed: 7,
      bb100A: 5.5,
      sdPorManoBB: 80,
      ci95: [-10.18, 21.18],
      statsA: {
        hands: 100,
        vpip: 0.2,
        pfr: 0.15,
        threeBet: 0.05,
        wtsd: 0.25,
        wsd: 0.5,
        aggro: 2,
        showdownRate: 0.1,
        distAcciones: { fold: 30, check: 20, call: 35, raise: 15 },
      },
      statsB: {
        hands: 100,
        vpip: 0.6,
        pfr: 0.1,
        threeBet: 0.03,
        wtsd: 0.4,
        wsd: 0.45,
        aggro: 1.2,
        showdownRate: 0.12,
        distAcciones: { fold: 20, check: 10, call: 50, raise: 20 },
      },
    } as unknown as Resultado;
    const tabla = formatTable(falso, "tag", "random");
    expect(tabla).toContain("bb/100");
    expect(tabla).toContain("IC95");
  });

  it("4. match de 20 manos random-vs-random termina con hands==20", async () => {
    const agenteA = agentePorId("random");
    const agenteB = agentePorId("random");
    const opciones = {
      hands: 20,
      seed: 1,
      stacks: 1000,
      blinds: { sb: 10, bb: 20 },
      stack: 1000,
      sb: 10,
      bb: 20,
    } as unknown as Parameters<typeof playMatch>[2];
    const resultado = (await playMatch(agenteA, agenteB, opciones)) as unknown as Record<
      string,
      unknown
    >;
    const manos =
      (resultado["hands"] as number | undefined) ??
      ((resultado["statsA"] as { hands?: number } | undefined)?.hands);
    expect(manos).toBe(20);
  }, 15000);
});
