// Tests del entrenador servidor (5): mueve priors, determinista, no muta,
// stats finitas y trainBatch(0) igual.
import { describe, expect, it } from "vitest";
import { createBrain } from "./brain";
import { manoAHandRecord, trainBatch } from "./trainer";

function movidos(priors: Record<string, number>): number {
  return Object.values(priors).filter((v) => v !== 0.5).length;
}

describe("trainer", () => {
  it("100 manos mueven priors", async () => {
    const base = createBrain();
    const antes = movidos(base.priors);
    const { brain, stats } = await trainBatch(base, { hands: 100, seed: 42 });
    const despues = movidos(brain.priors);
    expect(stats.hands).toBe(100);
    expect(despues).toBeGreaterThan(antes);
    expect(stats.priorsMovidos).toBe(despues);
  });

  it("determinista con mismo seed", async () => {
    const a = await trainBatch(createBrain(), { hands: 100, seed: 7 });
    const b = await trainBatch(createBrain(), { hands: 100, seed: 7 });
    expect(a.brain.priors).toEqual(b.brain.priors);
    expect(a.stats.winrateBB100).toBe(b.stats.winrateBB100);
  });

  it("no muta el brain de entrada", async () => {
    const base = createBrain();
    const snapshot = JSON.stringify(base);
    await trainBatch(base, { hands: 50, seed: 11 });
    expect(JSON.stringify(base)).toBe(snapshot);
    expect(base.handsPlayed).toBe(0);
  });

  it("stats finitas y showdown 0-1", async () => {
    const { stats } = await trainBatch(createBrain(), { hands: 50, seed: 99 });
    expect(Number.isFinite(stats.winrateBB100)).toBe(true);
    expect(stats.showdownPct).toBeGreaterThanOrEqual(0);
    expect(stats.showdownPct).toBeLessThanOrEqual(1);
  });

  it("trainBatch(0) devuelve igual", async () => {
    const base = createBrain();
    const { brain, stats } = await trainBatch(base, { hands: 0, seed: 5 });
    expect(brain.priors).toEqual(base.priors);
    expect(brain.handsPlayed).toBe(base.handsPlayed);
    expect(stats.hands).toBe(0);
    expect(stats.winrateBB100).toBe(0);
    expect(stats.showdownPct).toBe(0);
  });

  it("manoAHandRecord mapea bet→raise y all-in→allin", () => {
    const r1 = manoAHandRecord({ handId: "1:0", position: "BTN", action: "bet", rewardBB: 5 }, 0);
    expect(r1.won).toBe(true);
    expect(r1.actionHistory[0]?.action.startsWith("raise")).toBe(true);
    expect(r1.stackDelta).toBe(100);
    expect(r1.numRivales).toBe(5);
    const r2 = manoAHandRecord({ handId: "1:1", position: "BB", action: "all-in", rewardBB: -3 }, 1);
    expect(r2.won).toBe(false);
    expect(r2.actionHistory[0]?.action.startsWith("allin")).toBe(true);
  });
});
