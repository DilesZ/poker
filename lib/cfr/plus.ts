// Utilidades de CFR+ (TypeScript puro, cero dependencias).
// CFR+ (Tammelin) cambia dos cosas respecto al CFR vanilla:
//   1. Arrepentimientos nunca negativos: R[i] = max(R[i] + instant[i], 0).
//   2. Estrategia media ponderada linealmente por iteración (peso = t).
// Este módulo solo contiene las primitivas puras; el entrenador
// (trainer.ts) decide cuándo aplicarlas según `algorithm`.
import type { RegretNode } from "./node";

/**
 * Actualiza los arrepentimientos con la regla R+ (in-place, sin devolver nada).
 * R[i] = max(R[i] + instant[i], 0) para cada acción i.
 * Lanza si las longitudes de `regretSum` e `instant` no coinciden.
 */
export function applyRegretPlusUpdate(node: RegretNode, instant: number[]): void {
  if (node.regretSum.length !== instant.length) {
    throw new RangeError(
      `longitudes distintas: regretSum=${node.regretSum.length}, instant=${instant.length}`,
    );
  }
  for (let i = 0; i < node.regretSum.length; i++) {
    const acumulado = node.regretSum[i] + instant[i];
    node.regretSum[i] = acumulado > 0 ? acumulado : 0;
  }
}

/**
 * Peso lineal de la iteración t para la estrategia media de CFR+.
 * Retorna t. Lanza si t < 1 (las iteraciones empiezan en 1).
 */
export function linearWeight(t: number): number {
  if (!(t >= 1)) {
    throw new RangeError(`t debe ser ≥ 1 (recibido: ${t})`);
  }
  return t;
}
