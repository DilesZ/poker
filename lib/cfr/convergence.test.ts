// lib/cfr/convergence.test.ts — Convergencia del CFR en Kuhn/Leduc (español, P4).
// Gate de honestidad: si el CFR no converge aquí, prohibido tocar Hold'em.
import { describe, expect, it } from "vitest";
import { exploitability } from "./exploit";
import { strategyMap, trainCFR } from "./trainer";
import type { CFRGame } from "./game";
import * as moduloKuhn from "../games/kuhn";
import * as moduloLeduc from "../games/leduc";

function esJuego(valor: unknown): valor is CFRGame {
  if (valor === null || typeof valor !== "object") {
    return false;
  }
  const reg = valor as Record<string, unknown>;
  return typeof reg["newInitial"] === "function";
}

/** Localiza el objeto CFRGame en el módulo (tolera default, nombrado o factoría). */
function obtenerJuego(modulo: unknown, nombre: string): CFRGame {
  const candidatos: unknown[] = [];
  if (modulo !== null && typeof modulo === "object") {
    const reg = modulo as Record<string, unknown>;
    for (const clave of [nombre, `${nombre}Game`, "game", "juego", "default"]) {
      if (reg[clave] !== undefined) {
        candidatos.push(reg[clave]);
      }
    }
    for (const valor of Object.values(reg)) {
      if (!candidatos.includes(valor)) {
        candidatos.push(valor);
      }
    }
  }
  for (const c of candidatos) {
    if (esJuego(c)) {
      return c;
    }
  }
  for (const c of candidatos) {
    if (typeof c === "function") {
      try {
        const producido: unknown = (c as () => unknown)();
        if (esJuego(producido)) {
          return producido;
        }
      } catch {
        // Sigue buscando otros candidatos.
      }
    }
  }
  throw new Error(`Juego no encontrado en test: "${nombre}".`);
}

function exploitTras(juego: CFRGame, iterations: number, seed: number): number {
  const resultado = trainCFR({ game: juego, iterations, seed });
  return exploitability(juego, strategyMap(resultado));
}

describe("cfr/convergencia", () => {
  it("1. Kuhn con 5000 iters alcanza expl < 0.05", () => {
    const juego = obtenerJuego(moduloKuhn, "kuhn");
    const expl = exploitTras(juego, 5000, 12345);
    expect(expl).toBeGreaterThanOrEqual(0);
    expect(expl).toBeLessThan(0.05);
  }, 60000);

  it("2. Kuhn: expl(5000) < expl(500) (decrece con iteraciones)", () => {
    const juego = obtenerJuego(moduloKuhn, "kuhn");
    const explCorto = exploitTras(juego, 500, 7);
    const explLargo = exploitTras(juego, 5000, 7);
    expect(explLargo).toBeLessThan(explCorto);
  }, 60000);

  it("3. Leduc con 1500 iters alcanza expl < 0.6 y decrece vs 150", () => {
    const juego = obtenerJuego(moduloLeduc, "leduc");
    const explCorto = exploitTras(juego, 150, 7);
    const explLargo = exploitTras(juego, 1500, 7);
    expect(explLargo).toBeLessThan(0.6);
    expect(explLargo).toBeLessThan(explCorto);
  }, 120000);
});
