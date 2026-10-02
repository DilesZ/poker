// Tests de Kuhn póker sobre la interfaz CFR (vitest, cero deps salvo vitest).
import { describe, expect, it } from "vitest";
import { CHANCE, type CFRState } from "../cfr/game";
import { KuhnGame } from "./kuhn";

const juego = new KuhnGame();

/** Avanza una mesa: reparte c0 a P0, c1 a P1 y juega las apuestas en orden. */
function mesa(c0: string, c1: string, ...apuestas: string[]): CFRState {
  let estado = juego.newInitial();
  for (const accion of [c0, c1, ...apuestas]) estado = estado.apply(accion);
  return estado;
}

/** Generador determinista (LCG) para terminales aleatorios reproducibles. */
function lcg(semilla: number): () => number {
  let s = semilla >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** Terminal aleatorio: reparto sin reemplazo + apuestas legales al azar. */
function terminalAleatorio(azar: () => number): CFRState {
  const mazo = ["J", "Q", "K"];
  const c0 = mazo[Math.floor(azar() * 3)];
  const resto = mazo.filter((c) => c !== c0);
  const c1 = resto[Math.floor(azar() * 2)];
  let estado = juego.newInitial().apply(c0).apply(c1);
  while (!estado.isTerminal) {
    if (estado.turn === CHANCE) throw new Error("Azar inesperado tras el reparto");
    const legales = estado.legalActions();
    estado = estado.apply(legales[Math.floor(azar() * legales.length)]);
  }
  return estado;
}

describe("kuhn", () => {
  it("con pp gana la carta alta (J vs Q pierde P0: u0 = -1)", () => {
    const final = mesa("J", "Q", "pass", "pass");
    expect(final.isTerminal).toBe(true);
    expect(final.utility(0)).toBe(-1);
    expect(final.utility(1)).toBe(1);
  });

  it("con bet + fold gana el apostador aunque su carta sea peor", () => {
    // P0 apuesta con J y P1 abandona con Q: gana P0.
    expect(mesa("J", "Q", "bet", "fold").utility(0)).toBe(1);
    // P1 apuesta con J y P0 abandona con Q: gana P1 (u0 = -1).
    expect(mesa("Q", "J", "pass", "bet", "fold").utility(0)).toBe(-1);
  });

  it("con bet + call hay showdown a bote doble (±2)", () => {
    // K de P0 contra Q: gana P0 el bote igualado.
    const gana0 = mesa("K", "Q", "bet", "call");
    expect(gana0.isTerminal).toBe(true);
    expect(gana0.utility(0)).toBe(2);
    // J de P0 contra K: pierde P0 el bote igualado.
    expect(mesa("J", "K", "bet", "call").utility(0)).toBe(-2);
  });

  it("las utilidades suman cero en 20 terminales aleatorios", () => {
    const azar = lcg(42);
    for (let i = 0; i < 20; i++) {
      const final = terminalAleatorio(azar);
      expect(final.isTerminal).toBe(true);
      expect(final.utility(0) + final.utility(1)).toBe(0);
    }
  });

  it("claves distintas para distinta carta propia con la misma historia", () => {
    const conJ = mesa("J", "Q", "pass");
    const conK = mesa("K", "Q", "pass");
    // Misma historia pública ("p"), distinta carta de P0.
    expect(conJ.infosetKey(0)).not.toBe(conK.infosetKey(0));
    // Misma carta e historia para P1: misma clave (determinista).
    expect(conJ.infosetKey(1)).toBe(conK.infosetKey(1));
    expect(conJ.infosetKey(0)).toBe(conJ.infosetKey(0));
    // Regresión: P0 y P1 nunca comparten nodo aunque tengan cartas del
    // mismo rango en juego (el jugador forma parte de la key).
    const jVsK = mesa("J", "K", "pass");
    expect(jVsK.infosetKey(0)).not.toBe(jVsK.infosetKey(1));
  });
});
