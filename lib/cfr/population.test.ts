// lib/cfr/population.test.ts — Tests de la población de oponentes (vitest).
// Cubre: normalización/validación, muestreo determinista y proporcional,
// política uniforme, replay de checkpoint sintético (sin artefactos del repo),
// validateDisjoint y determinismo de trainVsPopulation.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createRng } from "@/lib/engine/rng";
import { kuhnGame } from "../games/kuhn";
import { toCheckpoint, saveCheckpoint } from "./checkpoint";
import { newNode } from "./node";
import {
  normalizePopulation,
  policyFor,
  sampleMember,
  validateDisjoint,
  type PopulationConfig,
  type PopulationMember,
} from "./population";
import { trainVsPopulation } from "./trainer";

describe("cfr/population", () => {
  it("1. normaliza pesos a suma 1 (copias) y rechaza configs inválidas", () => {
    const cfg: PopulationConfig = {
      members: [
        { id: "me", kind: "self", weight: 1 },
        { id: "rnd", kind: "uniform", weight: 3 },
      ],
    };
    const normalizados = normalizePopulation(cfg);
    expect(normalizados.map((m) => m.weight)).toEqual([0.25, 0.75]);
    const suma = normalizados.reduce((acc, m) => acc + m.weight, 0);
    expect(suma).toBeCloseTo(1, 12);
    // Son copias: mutar el resultado no toca la config original.
    (normalizados[0] as PopulationMember).weight = 99;
    expect(cfg.members[0]?.weight).toBe(1);

    const base: PopulationMember[] = [{ id: "a", kind: "self", weight: 1 }];
    const con = (m: PopulationMember): PopulationConfig => ({ members: [...base, m] });
    expect(() => normalizePopulation({ members: [] })).toThrow();
    expect(() => normalizePopulation(con({ id: "a", kind: "uniform", weight: 1 }))).toThrow(/duplicado/i);
    expect(() => normalizePopulation(con({ id: "", kind: "uniform", weight: 1 }))).toThrow();
    expect(() => normalizePopulation(con({ id: "w0", kind: "uniform", weight: 0 }))).toThrow();
    expect(() => normalizePopulation(con({ id: "wn", kind: "uniform", weight: -2 }))).toThrow();
    expect(() => normalizePopulation(con({ id: "wnan", kind: "uniform", weight: NaN }))).toThrow();
    expect(() => normalizePopulation(con({ id: "winf", kind: "uniform", weight: Infinity }))).toThrow();
    expect(() =>
      normalizePopulation(con({ id: "ck", kind: "checkpoint", weight: 1 })),
    ).toThrow(/checkpointPath/);
    expect(() =>
      normalizePopulation(con({ id: "ck", kind: "checkpoint", weight: 1, checkpointPath: "" })),
    ).toThrow(/checkpointPath/);
    expect(() =>
      normalizePopulation({ members: [{ id: "x", kind: "raro", weight: 1 } as unknown as PopulationMember] }),
    ).toThrow();
  });

  it("2. muestreo determinista con misma seed y proporcional a pesos", () => {
    const members = normalizePopulation({
      members: [
        { id: "a", kind: "self", weight: 2 },
        { id: "b", kind: "uniform", weight: 3 },
        { id: "c", kind: "uniform", weight: 5 },
      ],
    });
    const secuencia = (seed: number, n: number): string[] => {
      const rng = createRng(seed);
      return Array.from({ length: n }, () => sampleMember(members, rng).id);
    };
    expect(secuencia(42, 200)).toEqual(secuencia(42, 200));
    expect(secuencia(42, 200)).not.toEqual(secuencia(43, 200));
    // Proporcionalidad aproximada: 10000 muestras con seed fija, bandas ±5%.
    const n = 10000;
    const rng = createRng(7);
    const cuentas: Record<string, number> = { a: 0, b: 0, c: 0 };
    for (let i = 0; i < n; i++) {
      const id = sampleMember(members, rng).id;
      cuentas[id] = (cuentas[id] as number) + 1;
    }
    expect(Math.abs((cuentas["a"] as number) / n - 0.2)).toBeLessThan(0.05);
    expect(Math.abs((cuentas["b"] as number) / n - 0.3)).toBeLessThan(0.05);
    expect(Math.abs((cuentas["c"] as number) / n - 0.5)).toBeLessThan(0.05);
    expect(() => sampleMember([], createRng(1))).toThrow();
  });

  it("3. uniform devuelve distribución uniforme (y exige legal no vacío)", () => {
    const pol = policyFor({ id: "u", kind: "uniform", weight: 1 }, new Map());
    expect(pol("Kuhn:0:Q|", ["a", "b", "c"])).toEqual([1 / 3, 1 / 3, 1 / 3]);
    expect(pol("otra-key", ["x", "y"])).toEqual([0.5, 0.5]);
    expect(() => pol("k", [])).toThrow();
  });

  it("4. checkpoint reproduce la media del JSON (por nombre; miss/suma-0 → uniforme)", () => {
    const nodo = newNode(["pass", "bet"]);
    nodo.regretSum = [1.5, -0.5];
    nodo.strategySum = [80, 20];
    const vacio = newNode(["x", "y"]); // strategySum [0, 0]
    const cp = toCheckpoint(
      "v-test",
      "kuhn",
      7,
      100,
      new Map([
        ["Kuhn:0:Q|", nodo],
        ["Vacio", vacio],
      ]),
      0.02,
      "abc123",
    );
    const dir = mkdtempSync(join(tmpdir(), "cfr-pop-"));
    const ruta = join(dir, "cp.json");
    saveCheckpoint(ruta, cp);
    const pol = policyFor(
      { id: "frio", kind: "checkpoint", weight: 1, checkpointPath: ruta },
      new Map(),
    );
    const misma = pol("Kuhn:0:Q|", ["pass", "bet"]);
    expect(misma[0]).toBeCloseTo(0.8, 10);
    expect(misma[1]).toBeCloseTo(0.2, 10);
    // Robusto al orden: mapea por NOMBRE de acción.
    const invertida = pol("Kuhn:0:Q|", ["bet", "pass"]);
    expect(invertida[0]).toBeCloseTo(0.2, 10);
    expect(invertida[1]).toBeCloseTo(0.8, 10);
    // Infoset ausente en el checkpoint → uniforme.
    expect(pol("Kuhn:9:Z|", ["a", "b"])).toEqual([0.5, 0.5]);
    // strategySum con suma 0 → uniforme.
    expect(pol("Vacio", ["x", "y"])).toEqual([0.5, 0.5]);
    // Llamadas repetidas reutilizan la carga cacheada (no fallan ni releen mal).
    expect(pol("Kuhn:0:Q|", ["pass", "bet"])[0]).toBeCloseTo(0.8, 10);
    // Fichero inexistente → throw claro.
    expect(() =>
      policyFor(
        { id: "mal", kind: "checkpoint", weight: 1, checkpointPath: join(dir, "no-existe.json") },
        new Map(),
      )("k", ["a", "b"]),
    ).toThrow(/checkpoint/i);
  });

  it("5. validateDisjoint lanza con solape (incl. self/uniform) y pasa disjuntos", () => {
    const train: PopulationConfig = {
      members: [
        { id: "s", kind: "self", weight: 1 },
        { id: "u", kind: "uniform", weight: 1 },
      ],
    };
    const evalOk: PopulationConfig = {
      members: [
        { id: "s2", kind: "self", weight: 1 },
        { id: "frio", kind: "checkpoint", weight: 1, checkpointPath: "x.json" },
      ],
    };
    expect(() => validateDisjoint(train, evalOk)).not.toThrow();
    // Mismo id aunque cambie el kind también cuenta (filtra estrategia).
    const evalMal: PopulationConfig = { members: [{ id: "u", kind: "self", weight: 1 }] };
    expect(() => validateDisjoint(train, evalMal)).toThrow('"u"');
  });

  it("6. trainVsPopulation determinista: 2 runs Kuhn 200 iters misma seed iguales", () => {
    const pop: PopulationConfig = {
      members: [
        { id: "me", kind: "self", weight: 1 },
        { id: "rnd", kind: "uniform", weight: 1 },
      ],
    };
    const base = { game: kuhnGame, iterations: 200, seed: 5, population: pop } as const;
    const a = trainVsPopulation({ ...base });
    const b = trainVsPopulation({ ...base });
    expect(a.gameName).toBe("kuhn");
    expect(a.algorithm).toBe("cfr");
    expect(a.iterations).toBe(200);
    expect(a.seed).toBe(5);
    expect([...a.nodes.keys()].sort()).toEqual([...b.nodes.keys()].sort());
    expect([...a.nodes.keys()].length).toBeGreaterThan(0);
    for (const clave of a.nodes.keys()) {
      expect(a.nodes.get(clave)?.actions).toEqual(b.nodes.get(clave)?.actions);
      expect(a.nodes.get(clave)?.regretSum).toEqual(b.nodes.get(clave)?.regretSum);
      expect(a.nodes.get(clave)?.strategySum).toEqual(b.nodes.get(clave)?.strategySum);
    }
    expect(a.opponentCounts).toEqual(b.opponentCounts);
    const total = Object.values(a.opponentCounts).reduce((acc, x) => acc + x, 0);
    expect(total).toBe(200);
    expect(a.opponentCounts["me"]).toBeGreaterThan(0);
    expect(a.opponentCounts["rnd"]).toBeGreaterThan(0);
    // Validación de opciones.
    expect(() => trainVsPopulation({ ...base, iterations: -1 })).toThrow();
    expect(() => trainVsPopulation({ ...base, iterations: 1.5 })).toThrow();
    expect(() =>
      trainVsPopulation({ ...base, heroSeats: "raro" as unknown as "alternate" }),
    ).toThrow(/heroSeats/);
    expect(() => trainVsPopulation({ ...base, population: { members: [] } })).toThrow();
  });
});
