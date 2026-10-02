// lib/experiments/experiments.test.ts
//
// Pruebas del registro de experimentos: persistencia y comparación.
// Solo usa `node:fs`, `node:path` y `node:os` (tmpdir); sin dependencias.
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { compareExperiments, listExperiments, loadExperiment, saveExperiment } from "./store";
import type { EvalEntry, Experiment } from "./types";

function experimentoBase(parche: Partial<Experiment> = {}): Experiment {
  return {
    id: "exp-base",
    name: "Experimento base",
    createdAt: "2026-01-15T00:00:00.000Z",
    algorithm: "cfr",
    game: "kuhn",
    iterations: 100,
    seed: 7,
    checkpoint: { path: "checkpoints/exp-base.json", version: "v1", exploitability: 0.05 },
    curve: [{ iteration: 100, exploitability: 0.05 }],
    evaluations: [],
    ...parche,
  };
}

function dirTemporal(): string {
  return mkdtempSync(path.join(tmpdir(), "poker-experiments-"));
}

describe("experiments/store", () => {
  it("roundtrip: guarda y carga el mismo experimento", () => {
    const dir = dirTemporal();
    const original = experimentoBase({
      id: "exp-roundtrip",
      evaluations: [
        {
          opponent: "azar",
          hands: 10000,
          seed: 1,
          bb100: 12.5,
          ci95: [10.1, 14.9],
          extra: { mesas: 4, nota: "ok" },
        },
      ],
      notes: "nota de prueba",
    });
    const ruta = saveExperiment(dir, original);
    expect(ruta).toBe(path.join(dir, "exp-roundtrip.json"));
    expect(loadExperiment(ruta)).toEqual(original);
  });

  it("no sobrescribe un experimento existente", () => {
    const dir = dirTemporal();
    saveExperiment(dir, experimentoBase({ id: "exp-unico", name: "Original" }));
    const modificado = experimentoBase({ id: "exp-unico", name: "Modificado" });
    expect(() => saveExperiment(dir, modificado)).toThrow();
    expect(loadExperiment(path.join(dir, "exp-unico.json")).name).toBe("Original");
  });

  it("rechaza experimentos inválidos (sin id / algorithm malo)", () => {
    const dir = dirTemporal();
    const sinId = { ...experimentoBase(), id: undefined } as unknown as Experiment;
    expect(() => saveExperiment(dir, sinId)).toThrow();
    const algoritmoMalo = {
      ...experimentoBase({ id: "exp-malo" }),
      algorithm: "mccfr",
    } as unknown as Experiment;
    expect(() => saveExperiment(dir, algoritmoMalo)).toThrow();
  });

  it("list ordena por createdAt desc y salta .txt y JSON roto", () => {
    const dir = dirTemporal();
    saveExperiment(dir, experimentoBase({ id: "exp-viejo", createdAt: "2026-01-01T00:00:00.000Z" }));
    saveExperiment(dir, experimentoBase({ id: "exp-nuevo", createdAt: "2026-03-01T00:00:00.000Z" }));
    writeFileSync(path.join(dir, "notas.txt"), "no es un experimento", "utf8");
    writeFileSync(path.join(dir, "roto.json"), "{ esto no es json", "utf8");
    const lista = listExperiments(dir);
    expect(lista.map((e) => e.id)).toEqual(["exp-nuevo", "exp-viejo"]);
    expect(listExperiments(path.join(dir, "no-existe"))).toEqual([]);
  });

  it("compare exploitability: 0.02 vs 0.01 es significativa; 0.010 vs 0.011 no", () => {
    // Nota: la comparación exige un oponente común (base exigible documentada
    // en store.ts); por eso ambos pares comparten al rival "base".
    const rivalComun: EvalEntry = { opponent: "base", hands: 5000, seed: 3, bb100: 4, ci95: [3, 5] };
    const fabrica = (id: string, exploitability: number): Experiment =>
      experimentoBase({
        id,
        checkpoint: { path: `checkpoints/${id}.json`, version: "v1", exploitability },
        evaluations: [{ ...rivalComun }],
      });
    const grande = compareExperiments(fabrica("a1", 0.02), fabrica("b1", 0.01));
    expect(grande.find((f) => f.metric === "exploitability")?.significant).toBe(true);
    const chica = compareExperiments(fabrica("a2", 0.01), fabrica("b2", 0.011));
    expect(chica.find((f) => f.metric === "exploitability")?.significant).toBe(false);
  });

  it("compare bb100: IC95 que solapan → no significativo; sin solape → significativo", () => {
    const fabrica = (id: string, bb100: number, ci95: [number, number]): Experiment =>
      experimentoBase({
        id,
        evaluations: [{ opponent: "rival-x", hands: 20000, seed: 9, bb100, ci95 }],
      });
    const solape = compareExperiments(fabrica("a", 5, [0, 10]), fabrica("b", 6, [1, 11]));
    expect(solape.find((f) => f.metric === "bb100 vs rival-x")?.significant).toBe(false);
    const sinSolape = compareExperiments(fabrica("a", 5, [0, 10]), fabrica("b", 25, [20, 30]));
    expect(sinSolape.find((f) => f.metric === "bb100 vs rival-x")?.significant).toBe(true);
    const sinIc = {
      ...experimentoBase({ id: "c" }),
      evaluations: [{ opponent: "rival-x", hands: 1000, seed: 1, bb100: 5 }],
    } as unknown as Experiment;
    const filasSinIc = compareExperiments(fabrica("a", 5, [0, 10]), sinIc);
    const filaSinIc = filasSinIc.find((f) => f.metric === "bb100 vs rival-x");
    expect(filaSinIc?.significant).toBe(false);
    expect(filaSinIc?.note).toBeDefined();
  });

  it("sin oponentes comunes → array vacío (sin filas informativas)", () => {
    const a = experimentoBase({
      id: "exp-a",
      checkpoint: { path: "checkpoints/exp-a.json", version: "v1", exploitability: 0.05 },
      evaluations: [{ opponent: "rival-a", hands: 1000, seed: 1, bb100: 5, ci95: [0, 10] }],
    });
    const b = experimentoBase({
      id: "exp-b",
      checkpoint: { path: "checkpoints/exp-b.json", version: "v1", exploitability: 0.01 },
      evaluations: [{ opponent: "rival-b", hands: 1000, seed: 2, bb100: 7, ci95: [2, 12] }],
    });
    // Decisión documentada en store.ts: sin base común no se emite ni siquiera
    // la fila de exploitability; el llamador (CLI/UI) muestra el aviso.
    expect(compareExperiments(a, b)).toEqual([]);
  });
});
