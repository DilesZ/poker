// Tests de Hold'em HU preflop sobre la interfaz CFR (vitest).
import { describe, expect, it } from "vitest";
import { computePreflopEv } from "../../scripts/compute-preflop-ev";
import { CHANCE, type CFRState } from "../cfr/game";
import { BUCKETS, loadEvTable, loadEvTie } from "./buckets";
import { abstractHistory, DEFAULT_HU, holdemHuGame } from "./holdem-hu";

/** Tablas EV/tie: del JSON si existe; si no, Monte Carlo mínimo on-the-fly. */
function tablas(): { ev: number[][]; tie: number[][]; estricta: boolean } {
  try {
    return { ev: loadEvTable(), tie: loadEvTie(), estricta: true };
  } catch {
    const mini = computePreflopEv(20, 7);
    return { ev: mini.ev, tie: mini.tie, estricta: false };
  }
}

/** Generador determinista (LCG) para líneas aleatorias reproducibles. */
function lcg(semilla: number): () => number {
  let s = semilla >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** Línea aleatoria hasta terminal: azar por probs + acción legal al azar. */
function lineaAleatoria(juego: { newInitial(): CFRState }, azar: () => number): CFRState {
  let s = juego.newInitial();
  let pasos = 0;
  while (!s.isTerminal) {
    if (pasos++ > 200) throw new Error("línea demasiado larga (¿bucle?)");
    if (s.turn === CHANCE) {
      const outs = s.chanceOutcomes();
      let r = azar();
      let act = outs[outs.length - 1].action;
      for (const o of outs) {
        r -= o.prob;
        if (r <= 0) {
          act = o.action;
          break;
        }
      }
      s = s.apply(act);
    } else {
      const legales = s.legalActions();
      s = s.apply(legales[Math.floor(azar() * legales.length)]);
    }
  }
  return s;
}

describe("holdem-hu-preflop", () => {
  it("los 12 buckets suman 1326 combos y las probs suman 1", () => {
    expect(BUCKETS).toHaveLength(12);
    expect(BUCKETS.reduce((s, b) => s + b.combos, 0)).toBe(1326);
    const p = BUCKETS.reduce((s, b) => s + b.prob, 0);
    expect(p).toBeCloseTo(1, 10);
    for (const b of BUCKETS) expect(b.prob).toBeCloseTo(b.combos / 1326, 12);
  });

  it("la tabla EV es simétrica con diagonal 0.5", () => {
    const { ev, estricta } = tablas();
    expect(ev).toHaveLength(12);
    const tolDiag = estricta ? 0.02 : 0.2;
    const tolSim = estricta ? 0.05 : 0.3;
    for (let i = 0; i < 12; i++) expect(Math.abs(ev[i][i] - 0.5)).toBeLessThan(tolDiag);
    for (let a = 0; a < 12; a++) {
      for (let b = 0; b < 12; b++) {
        expect(Math.abs(ev[a][b] + ev[b][a] - 1)).toBeLessThan(tolSim);
      }
    }
  });

  it("zero-sum en 30 líneas aleatorias con seed", () => {
    const { ev, tie } = tablas();
    const juego = holdemHuGame(ev, tie);
    expect(juego.name).toBe("holdem-hu-preflop");
    const azar = lcg(1234);
    for (let i = 0; i < 30; i++) {
      const fin = lineaAleatoria(juego, azar);
      expect(fin.isTerminal).toBe(true);
      expect(fin.utility(0) + fin.utility(1)).toBe(0);
    }
  });

  it("las keys incluyen jugador, bucket propio y posición (SB/BB)", () => {
    const { ev, tie } = tablas();
    const juego = holdemHuGame(ev, tie);
    // Historial abstracto desde tokens externos ("raise2x"→r, "call"→c).
    const hist = abstractHistory(["raise2x", "call"]);
    expect(hist).toBe("rc");
    let s = juego.newInitial().apply("B4").apply("B1");
    expect(s.infosetKey(0)).toBe(`HU:B4:P0:SB:`);
    expect(s.infosetKey(1)).toBe(`HU:B1:P1:BB:`);
    for (const a of hist) s = s.apply(a);
    expect(s.infosetKey(0)).toContain("P0");
    expect(s.infosetKey(0)).toContain("B4");
    expect(s.infosetKey(0)).toContain("SB");
    expect(s.infosetKey(1)).toContain("P1");
    expect(s.infosetKey(1)).toContain("B1");
    expect(s.infosetKey(1)).toContain("BB");
    expect(s.infosetKey(0)).not.toBe(s.infosetKey(1));
    expect(() => abstractHistory(["flop/QJT"])).toThrow();
  });

  it("tope de raises: el 4.º raise es ilegal con maxRaises=3", () => {
    const { ev, tie } = tablas();
    const juego = holdemHuGame(ev, tie, { ...DEFAULT_HU, maxRaises: 3 });
    let s = juego.newInitial().apply("B0").apply("B11");
    s = s.apply("r").apply("r").apply("r"); // 3 raises (SB, BB, SB)
    expect(s.turn).toBe(1);
    expect(s.legalActions()).not.toContain("r");
    expect(s.legalActions()).toContain("c"); // call sí sigue legal
    expect(s.legalActions()).toContain("a"); // all-in sin tope
    expect(() => s.apply("r")).toThrow();
  });

  it("el fold paga el bote al otro (neto)", () => {
    const { ev, tie } = tablas();
    const juego = holdemHuGame(ev, tie);
    // SB (P0) abandona de inicio: pierde su ciega.
    const foldSb = juego.newInitial().apply("B2").apply("B5").apply("f");
    expect(foldSb.isTerminal).toBe(true);
    expect(foldSb.utility(0)).toBe(-DEFAULT_HU.sb);
    expect(foldSb.utility(1)).toBe(DEFAULT_HU.sb);
    // SB sube y BB abandona: P0 gana lo aportado por P1 (la BB).
    const foldBb = juego.newInitial().apply("B4").apply("B9").apply("r").apply("f");
    expect(foldBb.utility(0)).toBe(DEFAULT_HU.bb);
    expect(foldBb.utility(1)).toBe(-DEFAULT_HU.bb);
  });
});
