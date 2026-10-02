// scripts/train-pop.test.ts — Tests del CLI train con populations P6 (español).
// Requiere lib/cfr/population.ts (la crea otro agente en paralelo;
// este fichero programa contra ese contrato e integrará el dueño).
import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as ruta from "node:path";
import { hashConfig, parsePopulationArg } from "./train";
import { trainVsPopulation } from "../lib/cfr/population";
import { kuhnGame } from "../lib/games/kuhn";

describe("scripts/train con populations", () => {
  it("1. parsePopulationArg: JSON inline con forma PopulationConfig", () => {
    const cfg = parsePopulationArg('{"members":[{"id":"self","kind":"self","weight":1}]}');
    expect(cfg.members).toHaveLength(1);
    expect(cfg.members[0]?.id).toBe("self");
  });

  it("2. parsePopulationArg: @fichero temporal relativo al cwd", () => {
    const tmp = ruta.join(fs.mkdtempSync(ruta.join(os.tmpdir(), "pop-")), "pop.json");
    try {
      fs.writeFileSync(
        tmp,
        JSON.stringify({ members: [{ id: "uni", kind: "uniform", weight: 2 }] }),
        "utf8",
      );
      const cfg = parsePopulationArg(`@${ruta.relative(process.cwd(), tmp)}`);
      expect(cfg.members).toHaveLength(1);
      expect(cfg.members[0]?.id).toBe("uni");
    } finally {
      fs.rmSync(ruta.dirname(tmp), { recursive: true, force: true });
    }
  });

  it("3. parsePopulationArg: rechaza JSON inválido con error claro", () => {
    expect(() => parsePopulationArg("{no-json")).toThrow(/JSON inválido/i);
    expect(() => parsePopulationArg('{"sin":"members"}')).toThrow(/members/i);
    expect(() => parsePopulationArg("@no-existe-definitivo/pop.json")).toThrow(
      /No se pudo leer/i,
    );
  });

  it("4. trainVsPopulation: corre 20 iters en Kuhn con población solo-self y configHash difiere", () => {
    expect(typeof trainVsPopulation).toBe("function");
    const res = trainVsPopulation({
      game: kuhnGame,
      iterations: 20,
      seed: 1,
      algorithm: "cfr",
      population: { members: [{ id: "self", kind: "self", weight: 1 }] },
      heroSeats: "alternate",
    });
    expect(res.iterations).toBe(20);
    expect(res.nodes.size).toBeGreaterThan(0);
    const total = Object.values(res.opponentCounts).reduce((a, b) => a + b, 0);
    expect(total).toBe(20);
    expect(res.opponentCounts["self"]).toBe(20);

    const sin = hashConfig("cfr", "kuhn", 100, 1);
    const con = hashConfig("cfr", "kuhn", 100, 1, ["self"]);
    expect(sin).toBe(hashConfig("cfr", "kuhn", 100, 1));
    expect(con).not.toBe(sin);
  });
});
