// Tests del registro de entrenamientos (sin KV: usa memoria de proceso).
import { describe, expect, it } from "vitest";
import { __clearTrainJob, loadLatestTrainJob, recordTrainJob, type TrainJob } from "./jobs";

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
