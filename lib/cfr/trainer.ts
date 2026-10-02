// Entrenador CFR tabular vanilla (TypeScript puro, cero dependencias).
// Recorrido EXACTO completo del árbol: enumera el azar (sin muestreo) con
// updates simultáneos vanilla:
//   R(I,a) += πc · π−i · (v(a) − v(σ)),   S(I,a) += πi · σ(I,a).
// Determinista: la seed se guarda en el resultado para futuro MCCFR, pero
// el recorrido exacto no muestrea (mismos inputs → mismos outputs).
import { CHANCE, type CFRGame, type CFRState } from "./game";
import { averageStrategy, newNode, regretMatching, type RegretNode } from "./node";

export interface TrainOptions {
  game: CFRGame;
  iterations: number;
  seed: number;
}

export interface TrainResult {
  nodes: Map<string, RegretNode>;
  iterations: number;
  seed: number;
  gameName: string;
}

/** Entrena CFR vanilla con `iterations` recorridos exactos completos. */
export function trainCFR(opts: TrainOptions): TrainResult {
  const { game, iterations, seed } = opts;
  if (!Number.isInteger(iterations) || iterations < 0) {
    throw new RangeError(`iterations debe ser un entero ≥ 0 (recibido: ${iterations})`);
  }
  const nodes = new Map<string, RegretNode>();
  for (let i = 0; i < iterations; i++) {
    recorrer(game.newInitial(), 1, 1, 1, nodes);
  }
  return { nodes, iterations, seed, gameName: game.name };
}

/**
 * Estrategia media por infoset (averageStrategy de cada nodo;
 * sin visitas → uniforme, según el contrato de node.ts).
 */
export function strategyMap(result: TrainResult): Map<string, { actions: string[]; probs: number[] }> {
  const mapa = new Map<string, { actions: string[]; probs: number[] }>();
  for (const [clave, nodo] of result.nodes) {
    mapa.set(clave, { actions: [...nodo.actions], probs: averageStrategy(nodo) });
  }
  return mapa;
}

/**
 * Recorrido CFR con alcances (r0: P0, r1: P1, rc: azar).
 * Terminal → [u0, u1]; azar → Σ prob·hijo (rc·prob);
 * jugador p → regret matching, acumula S += reach[p]·σ y
 * R[a] += rc·reach[1−p]·(hijo[p] − v). Devuelve [u0, u1] = Σ σa·hijo.
 */
function recorrer(
  estado: CFRState,
  alcance0: number,
  alcance1: number,
  alcanceAzar: number,
  nodos: Map<string, RegretNode>,
): [number, number] {
  if (estado.isTerminal) {
    return [estado.utility(0), estado.utility(1)];
  }
  if (estado.turn === CHANCE) {
    let u0 = 0;
    let u1 = 0;
    for (const { action, prob } of estado.chanceOutcomes()) {
      const [h0, h1] = recorrer(estado.apply(action), alcance0, alcance1, alcanceAzar * prob, nodos);
      u0 += prob * h0;
      u1 += prob * h1;
    }
    return [u0, u1];
  }
  const jugador = estado.turn; // 0 | 1 (el azar ya se trató arriba)
  const clave = estado.infosetKey(jugador);
  let nodo = nodos.get(clave);
  if (nodo === undefined) {
    nodo = newNode(estado.legalActions());
    nodos.set(clave, nodo);
  }
  const sigma = regretMatching(nodo);
  const alcancePropio = jugador === 0 ? alcance0 : alcance1;
  const alcanceRival = jugador === 0 ? alcance1 : alcance0;
  for (let i = 0; i < nodo.actions.length; i++) {
    nodo.strategySum[i] += alcancePropio * sigma[i];
  }
  const valorHijo: number[] = [];
  let valor = 0;
  let u0 = 0;
  let u1 = 0;
  for (let i = 0; i < nodo.actions.length; i++) {
    const sig0 = jugador === 0 ? alcance0 * sigma[i] : alcance0;
    const sig1 = jugador === 1 ? alcance1 * sigma[i] : alcance1;
    const [h0, h1] = recorrer(estado.apply(nodo.actions[i]), sig0, sig1, alcanceAzar, nodos);
    const propio = jugador === 0 ? h0 : h1;
    valorHijo.push(propio);
    valor += sigma[i] * propio;
    u0 += sigma[i] * h0;
    u1 += sigma[i] * h1;
  }
  for (let i = 0; i < nodo.actions.length; i++) {
    nodo.regretSum[i] += alcanceAzar * alcanceRival * (valorHijo[i] - valor);
  }
  return [u0, u1];
}
