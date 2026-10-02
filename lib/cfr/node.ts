// Nodo de arrepentimientos por infoset para CFR (TypeScript puro, cero deps).
// Guarda los acumulados intactos (sin truncar) para dejar la puerta abierta
// a CFR+ (reseteo de arrepentimientos negativos) en el futuro: el truncado
// a max(0, R) solo se aplica al calcular la estrategia, nunca al almacenar.
export interface RegretNode {
  actions: string[];
  regretSum: number[];
  strategySum: number[];
}

/** Crea un nodo con acumulados a cero (copia la lista de acciones). */
export function newNode(actions: string[]): RegretNode {
  return {
    actions: [...actions],
    regretSum: actions.map(() => 0),
    strategySum: actions.map(() => 0),
  };
}

/**
 * Regret matching: estrategia proporcional a max(0, R).
 * Si todo es <= 0, uniforme. Devuelve un array NUEVO, no muta el nodo.
 */
export function regretMatching(node: RegretNode): number[] {
  const n = node.actions.length;
  if (n === 0) return [];
  const positivos = node.regretSum.map((r) => (r > 0 ? r : 0));
  const total = positivos.reduce((acum, v) => acum + v, 0);
  if (total <= 0) return node.actions.map(() => 1 / n);
  return positivos.map((v) => v / total);
}

/** Estrategia actual del nodo (= regret matching). Array nuevo. */
export function currentStrategy(node: RegretNode): number[] {
  return regretMatching(node);
}

/**
 * Estrategia media: normaliza strategySum (acumulado ponderado por alcance).
 * Si la suma es 0 (nodo nunca visitado), uniforme. Devuelve array nuevo.
 */
export function averageStrategy(node: RegretNode): number[] {
  const n = node.actions.length;
  if (n === 0) return [];
  const total = node.strategySum.reduce((acum, v) => acum + v, 0);
  if (total <= 0) return node.actions.map(() => 1 / n);
  return node.strategySum.map((v) => v / total);
}
