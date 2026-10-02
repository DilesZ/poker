// Tests del registro de entrenamientos (sin KV: usa memoria de proceso).
import { describe, expect, it } from "vitest";
import {
  __clearEvalJob,
  __clearTrainJob,
  loadLatestEvalJob,
  loadLatestTrainJob,
  recordEvalJob,
  recordTrainJob,
  type EvalJob,
  type TrainJob,
} from "./jobs";

function job(parche?: Partial<TrainJob>): TrainJob {
  const ahora = Date.now();
  return {
    id: "T-1",
    status: "done",
    requested: 1000,
    done: 1000,
    winrateBB100: -50,
    showdownPct: 0.9,
    handsPlayed: 1000,
    startedAt: ahora,
    updatedAt: ahora,
    ...parche,
  };
}

describe("jobs", () => {
  it("1. sin jobs devuelve null", async () => {
    __clearTrainJob();
    expect(await loadLatestTrainJob()).toBeNull();
  });

  it("2. roundtrip guarda y lee el último", async () => {
    __clearTrainJob();
    await recordTrainJob(job({ id: "T-1", done: 1000 }));
    await recordTrainJob(job({ id: "T-2", done: 500 }));
    const ultimo = await loadLatestTrainJob();
    expect(ultimo?.id).toBe("T-2");
    expect(ultimo?.done).toBe(500);
  });

  it("3. registra errores sin romper", async () => {
    __clearTrainJob();
    await recordTrainJob(job({ id: "T-e", status: "error", error: "timeout" }));
    const ultimo = await loadLatestTrainJob();
    expect(ultimo?.status).toBe("error");
    expect(ultimo?.error).toBe("timeout");
  });

  it("4. nunca lanza con basura", async () => {
    __clearTrainJob();
    await recordTrainJob(job());
    expect(await loadLatestTrainJob()).not.toBeNull();
  });
});

function evalJob(parche?: Partial<EvalJob>): EvalJob {
  const ahora = Date.now();
  return {
    id: "E-1",
    status: "done",
    hands: 1000,
    bb100: 3.5,
    sd: 40,
    ci95: 2.5,
    showdownPct: 0.25,
    brainDecisions: 800,
    seed: 42,
    startedAt: ahora,
    updatedAt: ahora,
    ...parche,
  };
}

describe("jobs eval", () => {
  it("5. sin evals devuelve null inicial", async () => {
    __clearEvalJob();
    expect(await loadLatestEvalJob()).toBeNull();
  });

  it("6. roundtrip eval guarda y lee el último", async () => {
    __clearEvalJob();
    await recordEvalJob(evalJob({ id: "E-1", bb100: 1.5 }));
    await recordEvalJob(evalJob({ id: "E-2", bb100: 4.25 }));
    const ultimo = await loadLatestEvalJob();
    expect(ultimo?.id).toBe("E-2");
    expect(ultimo?.bb100).toBe(4.25);
  });

  it("7. registra eval con error sin romper", async () => {
    __clearEvalJob();
    await recordEvalJob(evalJob({ id: "E-e", status: "error", error: "sin evaluador" }));
    const ultimo = await loadLatestEvalJob();
    expect(ultimo?.status).toBe("error");
    expect(ultimo?.error).toBe("sin evaluador");
  });
});
