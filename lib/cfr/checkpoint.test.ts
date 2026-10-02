import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadCheckpoint, saveCheckpoint, toCheckpoint, type CfrCheckpoint } from "./checkpoint";
import { newNode } from "./node";

function ejemplo(): CfrCheckpoint {
  const n = newNode(["pass", "bet"]);
  n.regretSum = [1.5, -0.5];
  n.strategySum = [80, 20];
  const nodos = new Map([["Kuhn:0:Q|", n]]);
  return toCheckpoint("v-test", "kuhn", 7, 100, nodos, 0.02, "abc123");
}

describe("cfr/checkpoint", () => {
  it("roundtrip save/load conserva nodos y métricas", () => {
    const dir = mkdtempSync(join(tmpdir(), "cfr-cp-"));
    const ruta = join(dir, "cp.json");
    const cp = ejemplo();
    saveCheckpoint(ruta, cp);
    const leido = loadCheckpoint(ruta);
    expect(leido).toEqual(cp);
    expect(leido.nodes["Kuhn:0:Q|"]).toEqual({ actions: ["pass", "bet"], r: [1.5, -0.5], s: [80, 20] });
    expect(JSON.parse(readFileSync(ruta, "utf8")).metrics.exploitability).toBe(0.02);
  });

  it("no sobrescribe un checkpoint existente", () => {
    const dir = mkdtempSync(join(tmpdir(), "cfr-cp-"));
    const ruta = join(dir, "cp.json");
    saveCheckpoint(ruta, ejemplo());
    expect(() => saveCheckpoint(ruta, ejemplo())).toThrow(/existe/);
  });

  it("rechaza JSON inválido o con forma incorrecta", () => {
    const dir = mkdtempSync(join(tmpdir(), "cfr-cp-"));
    const mala = join(dir, "mala.json");
    saveCheckpoint(mala, ejemplo());
    writeFileSync(mala, "{no-json");
    expect(() => loadCheckpoint(mala)).toThrow(/inválido/i);
    writeFileSync(mala, JSON.stringify({ version: "x" }));
    expect(() => loadCheckpoint(mala)).toThrow(/inválido/i);
  });
});
