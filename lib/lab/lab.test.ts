// lib/lab/lab.test.ts — 7 tests del laboratorio (jobs + benchmark).
// Español. Cero deps salvo los módulos indicados y node:fs/os/path.
// Sin Math.random: todo sembrado.
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { quickTrain, listCheckpoints, TRAIN_CAPS } from "./jobs";
import { runLabBenchmark, BENCH_CAPS } from "./benchmark";
import { saveCheckpoint, toCheckpoint } from "@/lib/cfr/checkpoint";

describe("lab/jobs", () => {
  it("1. cap excedido en kuhn lanza con el tope", () => {
    const tope = TRAIN_CAPS["kuhn"] as number;
    expect(() =>
      quickTrain({ game: "kuhn", algorithm: "cfr", iterations: tope + 1, seed: 1 }),
    ).toThrow(new RegExp(String(tope)));
  });

  it("2. cap excedido en leduc lanza con el tope", () => {
    const tope = TRAIN_CAPS["leduc"] as number;
    expect(() =>
      quickTrain({ game: "leduc", algorithm: "cfr", iterations: tope + 1, seed: 1 }),
    ).toThrow(new RegExp(String(tope)));
  });

  it("3. cap excedido en holdem-hu-preflop lanza con el tope", () => {
    const tope = TRAIN_CAPS["holdem-hu-preflop"] as number;
    expect(() =>
      quickTrain({ game: "holdem-hu-preflop", algorithm: "cfr", iterations: tope + 1, seed: 1 }),
    ).toThrow(new RegExp(String(tope)));
  });

  it("4. curva con 8 hitos y último punto == finalExploitability", () => {
    const res = quickTrain({ game: "kuhn", algorithm: "cfr", iterations: 200, seed: 1 });
    // n=200 > 50 y juego no-HU → 8 hitos logarítmicos únicos.
    expect(res.curve).toHaveLength(8);
    expect(res.curve[res.curve.length - 1]?.iteration).toBe(200);
    const ultimo = res.curve[res.curve.length - 1]?.exploitability as number;
    expect(res.finalExploitability).toBe(ultimo);
    expect(res.checkpoint.metrics.exploitability).toBe(res.finalExploitability);
    expect(res.checkpoint.version).toBe("lab-1-200");
    expect(res.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it("5. listCheckpoints ordena por timestamp desc y salta inválidos", () => {
    const dir = mkdtempSync(join(tmpdir(), "lab-list-"));
    const cpViejo = toCheckpoint("v-viejo", "kuhn", 1, 10, new Map(), 0.5, "hash-a");
    cpViejo.timestamp = "2026-01-01T00:00:00.000Z";
    const cpNuevo = toCheckpoint("v-nuevo", "kuhn", 2, 20, new Map(), 0.1, "hash-b");
    cpNuevo.timestamp = "2026-01-02T00:00:00.000Z";
    // Nombres distintos: saveCheckpoint lanza si la ruta ya existe.
    saveCheckpoint(join(dir, "a.json"), cpViejo);
    saveCheckpoint(join(dir, "b.json"), cpNuevo);
    writeFileSync(join(dir, "roto.json"), "{no-json");
    writeFileSync(join(dir, "notas.txt"), "ignorado por extensión");
    const metas = listCheckpoints(dir);
    expect(metas).toHaveLength(2);
    expect(metas[0]?.version).toBe("v-nuevo");
    expect(metas[1]?.version).toBe("v-viejo");
    expect(metas[0]?.exploitability).toBe(0.1);
    expect((metas[0]?.timestamp as string) > (metas[1]?.timestamp as string)).toBe(true);
    // Dir inexistente → [].
    expect(listCheckpoints(join(dir, "no-existe"))).toEqual([]);
  });
});

describe("lab/benchmark", () => {
  it("6. baseline-vs-baseline a 20 manos devuelve hands==20", () => {
    const r = runLabBenchmark({
      a: { kind: "baseline", id: "tag" },
      b: { kind: "baseline", id: "nit" },
      hands: 20,
      seed: 3,
    });
    expect(r.result.hands).toBe(20);
    expect(r.missesA).toBe(0);
    expect(r.missesB).toBe(0);
    expect(r.fallbacksA).toBe(0);
    expect(r.fallbacksB).toBe(0);
  });

  it("7. ckpt sintético vs baseline a 20 manos y manos>2000 lanza", () => {
    const dir = mkdtempSync(join(tmpdir(), "lab-bench-"));
    const ruta = join(dir, "sintetico.json");
    // Checkpoint vacío en memoria → siempre miss → fallback; se guarda en
    // tmpdir porque loadCfrPreflopAgent necesita fichero.
    const cp = toCheckpoint("v-sint", "holdem-hu-preflop", 9, 10, new Map(), 0.5, "hash-s", "cfr");
    saveCheckpoint(ruta, cp);
    const r = runLabBenchmark({
      a: { kind: "ckpt", path: ruta },
      b: { kind: "baseline", id: "tag" },
      hands: 20,
      seed: 5,
    });
    expect(r.result.hands).toBe(20);
    expect(r.missesA).toBeGreaterThanOrEqual(0);
    expect(r.fallbacksA).toBeGreaterThanOrEqual(0);
    // Tope de manos.
    expect(() =>
      runLabBenchmark({
        a: { kind: "baseline", id: "tag" },
        b: { kind: "baseline", id: "nit" },
        hands: BENCH_CAPS.maxHands + 1,
        seed: 1,
      }),
    ).toThrow(/2000/);
  });
});
