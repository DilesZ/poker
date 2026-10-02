// Tests de Leduc Hold'em sobre la interfaz CFR (vitest, cero deps salvo vitest).
import { describe, expect, it } from "vitest";
import { CHANCE, type CFRState } from "../cfr/game";
import { leducGame } from "./leduc";

/** Mesa hasta el showdown: reparte, juega R1, reparte pública y juega R2. */
function mesa(p0: string, p1: string, pub: string, r1: string[], r2: string[]): CFRState {
  let estado = leducGame.newInitial();
  for (const accion of [p0, p1, ...r1, pub, ...r2]) estado = estado.apply(accion);
  return estado;
}

/** Mesa en ronda 2 sin apuestas en R2: reparte y cierra R1 con pass, pass. */
function enRonda2(p0: string, p1: string, pub: string): CFRState {
  return mesa(p0, p1, pub, ["pass", "pass"], []);
}

/** Generador determinista (LCG) para terminales aleatorios reproducibles. */
function lcg(semilla: number): () => number {
  let s = semilla >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** Terminal aleatorio: reparto sin reemplazo + acciones legales al azar. */
function terminalAleatorio(azar: () => number): CFRState {
  let estado = leducGame.newInitial();
  while (!estado.isTerminal) {
    if (estado.turn === CHANCE) {
      const outs = estado.chanceOutcomes();
      let r = azar();
      let elegido = outs[outs.length - 1].action;
      for (const o of outs) {
        r -= o.prob;
        if (r <= 0) {
          elegido = o.action;
          break;
        }
      }
      estado = estado.apply(elegido);
    } else {
      const legales = estado.legalActions();
      estado = estado.apply(legales[Math.floor(azar() * legales.length)]);
    }
  }
  return estado;
}

describe("leduc", () => {
  it("showdown: la pareja con la pública gana a la carta alta", () => {
    // Q de P0 empareja la pública; K de P1 queda como carta alta.
    const gana0 = mesa("Q", "K", "Q", ["pass", "pass"], ["pass", "pass"]);
    expect(gana0.isTerminal).toBe(true);
    expect(gana0.utility(0)).toBe(1);
    expect(gana0.utility(1)).toBe(-1);
    // Al revés: la pareja de P1 gana (u0 = −1).
    expect(mesa("K", "Q", "Q", ["pass", "pass"], ["pass", "pass"]).utility(0)).toBe(-1);
  });

  it("split con la misma mano (mismo rango, palos distintos)", () => {
    // J, J con pública K: nadie empareja, misma carta alta → reparto.
    const fin = mesa("J", "J", "K", ["pass", "pass"], ["pass", "pass"]);
    expect(fin.isTerminal).toBe(true);
    expect(fin.utility(0)).toBe(0);
    expect(fin.utility(1)).toBe(0);
  });

  it("tope de subidas: la 3.ª apuesta agresiva es ilegal", () => {
    let estado = leducGame.newInitial().apply("J").apply("Q");
    expect(estado.legalActions()).toEqual(["pass", "bet"]);
    // Apuesta + igualada: aún se puede resubir (2.ª agresiva).
    estado = estado.apply("bet").apply("bet");
    expect(estado.legalActions()).toContain("bet");
    // 2.ª agresiva + igualada: la 3.ª subida es ilegal (solo pasar).
    estado = estado.apply("bet").apply("bet");
    expect(estado.legalActions()).toEqual(["pass"]);
    expect(() => estado.apply("bet")).toThrow();
  });

  it("los botes suman cero (folds, showdowns y 20 terminales aleatorios)", () => {
    const foldR1 = leducGame.newInitial().apply("J").apply("Q").apply("bet").apply("pass");
    expect(foldR1.isTerminal).toBe(true);
    expect(foldR1.utility(0)).toBe(1); // P1 se retira ante la apuesta
    const lineas = [
      foldR1,
      mesa("Q", "K", "Q", ["pass", "pass"], ["pass", "pass"]),
      mesa("J", "J", "K", ["pass", "pass"], ["pass", "pass"]),
      mesa("K", "Q", "J", ["bet", "bet", "pass", "pass"], ["bet", "bet", "pass", "pass"]),
    ];
    for (const fin of lineas) {
      expect(fin.isTerminal).toBe(true);
      expect(fin.utility(0) + fin.utility(1)).toBe(0);
    }
    const azar = lcg(1234);
    for (let i = 0; i < 20; i++) {
      const fin = terminalAleatorio(azar);
      expect(fin.isTerminal).toBe(true);
      expect(fin.utility(0) + fin.utility(1)).toBe(0);
    }
  });

  it("las claves distinguen jugador, pública y ronda (Leduc:jug:priv|pub|hist)", () => {
    const r1 = leducGame.newInitial().apply("J").apply("Q").apply("pass");
    expect(r1.infosetKey(0)).toBe("Leduc:0:J|-|pass");
    // El jugador forma parte de la key: P0 y P1 nunca comparten nodo.
    expect(r1.infosetKey(0)).not.toBe(r1.infosetKey(1));
    expect(r1.infosetKey(1)).toBe("Leduc:1:Q|-|pass");
    const conQ = enRonda2("J", "Q", "Q");
    const conK = enRonda2("J", "Q", "K");
    // Misma privada e historia de R1, distinta pública → distinta clave.
    expect(conQ.infosetKey(0)).toBe("Leduc:0:J|Q|pass,pass/");
    expect(conK.infosetKey(0)).toBe("Leduc:0:J|K|pass,pass/");
    expect(conQ.infosetKey(0)).not.toBe(conK.infosetKey(0));
    // Ronda 1 (sin pública) frente a ronda 2 → distinta clave.
    expect(conQ.infosetKey(0)).not.toBe(r1.infosetKey(0));
    // Determinista: mismo estado → misma clave.
    expect(conQ.infosetKey(0)).toBe(conQ.infosetKey(0));
  });
});
