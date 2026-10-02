// scripts/experiment.test.ts — Tests del pipeline de experimentos (español).
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { parseArgs, runExperiment } from "./experiment";
import { loadExperiment } from "../lib/experiments/store";

describe("scripts/experiment", () => {
  it("1. parseArgs: defaults (algorithm cfr+, 10000 iters, seed 7, eval-hands 2000, rutas por name)", () => {
    const o = parseArgs(["--name", "exp-001"]);
    expect(o.name).toBe("exp-001");
    expect(o.game).toBe("kuhn");
    expect(o.algorithm).toBe("cfr+");
    expect(o.iterations).toBe(10000);
    expect(o.seed).toBe(7);
    expect(o.evalHands).toBe(2000);
    expect(o.evalBaselines).toEqual([]);
    expect(o.ckptOut).toBe("checkpoints/exp-001.json");
    expect(o.out).toBe("experiments/exp-001.json");
    expect(o.notes).toBeUndefined();
  });

  it("2. parseArgs: flags completos, formato --flag=valor y error claro fuera de HU", () => {
    const o = parseArgs([
      "--name=exp-hu-01",
      "--game",
      "holdem-hu-preflop",
      "--algorithm=cfr",
      "--iterations",
      "200",
      "--seed=11",
      "--eval-baselines",
      "tag,nit",
      "--eval-hands=50",
      "--ckpt-out",
      "checkpoints/x.json",
      "--out",
      "experiments/x.json",
      "--notes",
      "prueba",
    ]);
    expect(o.game).toBe("holdem-hu-preflop");
    expect(o.algorithm).toBe("cfr");
    expect(o.iterations).toBe(200);
    expect(o.seed).toBe(11);
    expect(o.evalBaselines).toEqual(["tag", "nit"]);
    expect(o.evalHands).toBe(50);
    expect(o.notes).toBe("prueba");
    // Transfer fuera de HU → error claro.
    expect(() => parseArgs(["--name", "e", "--game", "kuhn", "--eval-baselines", "tag"])).toThrowError(
      /solo en holdem-hu-preflop/i,
    );
  });

  it("3. experimento kuhn 200 iters sin evals end-to-end en tmpdir", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "exp-test-"));
    const ckptOut = path.join(dir, "checkpoints", "exp-k200.json");
    const out = path.join(dir, "experiments", "exp-k200.json");
    const { experimento, rutaExperimento } = runExperiment({
      ...parseArgs(["--name", "exp-k200", "--game", "kuhn", "--iterations", "200", "--seed", "7"]),
      ckptOut,
      out,
    });
    expect(experimento.id).toBe("exp-k200");
    expect(experimento.abstraction).toBe("exact");
    expect(experimento.evaluations).toEqual([]);
    expect(experimento.checkpoint.version).toBe("exp-k200");
    expect(Number.isFinite(experimento.checkpoint.exploitability)).toBe(true);
    expect(experimento.curve.length).toBeGreaterThan(0);
    // Persistido y recargable desde disco.
    const recargado = loadExperiment(rutaExperimento);
    expect(recargado.id).toBe("exp-k200");
    expect(JSON.parse(readFileSync(ckptOut, "utf8")).version).toBe("exp-k200");
  });

  it("4. error si --eval-baselines con game kuhn (también vía parseArgs)", () => {
    expect(() =>
      runExperiment({
        ...parseArgs(["--name", "exp-mal"]),
        game: "kuhn",
        evalBaselines: ["tag"],
      }),
    ).toThrowError(/solo en holdem-hu-preflop/i);
  });
});
