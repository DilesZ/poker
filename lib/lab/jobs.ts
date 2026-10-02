// lib/lab/jobs.ts — Entrenamiento rápido CFR para el laboratorio (P-lab).
// Cero dependencias salvo los módulos CFR/juegos indicados y node:fs/path
// (solo en listCheckpoints). Sin Math.random: todo determinista por seed.
// Español. TypeScript estricto.
import * as fs from "node:fs";
import * as path from "node:path";
import type { CFRGame } from "@/lib/cfr/game";
import { strategyMap, trainCFR, trainVsPopulation } from "@/lib/cfr/trainer";
import { exploitability } from "@/lib/cfr/exploit";
import { loadCheckpoint, toCheckpoint, type CfrCheckpoint } from "@/lib/cfr/checkpoint";
import type { PopulationConfig } from "@/lib/cfr/population";
import { kuhnGame } from "@/lib/games/kuhn";
import { leducGame } from "@/lib/games/leduc";
import { holdemHuGame } from "@/lib/games/holdem-hu";
import { loadEvTable, loadEvTie } from "@/lib/games/buckets";
import type { RegretNode } from "@/lib/cfr/node";

/** Juego soportado por el laboratorio. */
export type QuickGame = "kuhn" | "leduc" | "holdem-hu-preflop";

/** Algoritmo soportado. */
export type QuickAlgorithm = "cfr" | "cfr+";

/** Petición de entrenamiento rápido. */
export interface QuickTrainRequest {
  game: "kuhn" | "leduc" | "holdem-hu-preflop";
  algorithm: "cfr" | "cfr+";
  iterations: number;
  seed: number;
  population?: PopulationConfig;
}

/** Punto de la curva de exploitabilidad. */
export interface CurvePoint {
  iteration: number;
  exploitability: number;
}

/** Metadatos resumidos de un checkpoint en disco. */
export interface CheckpointMeta {
  file: string;
  version: string;
  algorithm: string;
  game: string;
  seed: number;
  iterations: number;
  exploitability: number;
  timestamp: string;
}

/** Resultado del entrenamiento rápido. */
export interface QuickTrainResult {
  game: string;
  algorithm: string;
  iterations: number;
  seed: number;
  curve: CurvePoint[];
  finalExploitability: number;
  checkpoint: CfrCheckpoint;
  elapsedMs: number;
}

/** Topes de iteraciones por juego (protegen el presupuesto serverless). */
export const TRAIN_CAPS: Record<string, number> = {
  kuhn: 50000,
  leduc: 5000,
  "holdem-hu-preflop": 500,
};

/** Resuelve el nombre del juego a su implementación CFR. */
function resolverJuego(game: string): CFRGame {
  if (game === "kuhn") return kuhnGame;
  if (game === "leduc") return leducGame;
  if (game === "holdem-hu-preflop") {
    const ev = loadEvTable();
    const tie = loadEvTie();
    return holdemHuGame(ev, tie);
  }
  throw new Error(`Juego desconocido: "${game}". Usa "kuhn", "leduc" o "holdem-hu-preflop".`);
}

/**
 * Hitos de la curva para n iteraciones.
 * - Si n <= 50: un solo hito [n] (barato y exacto).
 * - Si no: numHitos logarítmicos n/2^(k)…n redondeados y únicos
 *   (numHitos = 5 en HU preflop, 8 en el resto para acotar el coste).
 */
function hitosPara(n: number, game: string): number[] {
  if (n <= 50) return [n];
  const numHitos = game === "holdem-hu-preflop" ? 5 : 8;
  const brutos: number[] = [];
  for (let i = numHitos - 1; i >= 0; i--) {
    brutos.push(Math.max(1, Math.round(n / 2 ** i)));
  }
  const unicos = [...new Set(brutos)].filter((h) => h >= 1 && h <= n).sort((a, b) => a - b);
  if (unicos.length === 0) return [n];
  if (unicos[unicos.length - 1] !== n) unicos.push(n);
  return unicos;
}

/** Hash de configuración determinista (sin dependencias). */
function hashConfig(req: QuickTrainRequest, n: number): string {
  const base = `${req.game}|${req.algorithm}|${req.seed}|${n}`;
  if (req.population === undefined) return base;
  const miembros = req.population.members.map((m) => `${m.id}:${m.kind}`).join(",");
  return `${base}|${miembros}`;
}

/**
 * Entrena CFR/CFR+ hasta `iterations` y devuelve la curva de
 * exploitabilidad, el checkpoint en memoria y el tiempo empleado.
 *
 * NOTA DE COSTE (honesta): el trainer no expone curvas intermedias, así que
 * la curva REENTRENA DESDE CERO hasta cada hito (determinista por seed, pero
 * no idéntica al promediado de un único train largo: cada hito es una curva
 * válida del algoritmo con ese presupuesto). Con los topes actuales el
 * coste queda acotado (HU: 5 hitos × ≤500 iters).
 *
 * - Sin `population`: self-play con trainCFR.
 * - Con `population`: trainVsPopulation con heroSeats "alternate".
 * - La versión del checkpoint es determinista `lab-<seed>-<iterations>`
 *   (no se guarda en disco aquí; la colisión de nombres no importa).
 */
export function quickTrain(req: QuickTrainRequest): QuickTrainResult {
  const inicio = Date.now();
  const game = req.game;
  const algorithm = req.algorithm;
  if (game !== "kuhn" && game !== "leduc" && game !== "holdem-hu-preflop") {
    throw new Error(`Juego desconocido: "${String(game)}". Usa "kuhn", "leduc" o "holdem-hu-preflop".`);
  }
  if (algorithm !== "cfr" && algorithm !== "cfr+") {
    throw new Error(`Algoritmo desconocido: "${String(algorithm)}". Usa "cfr" o "cfr+".`);
  }
  const cap = TRAIN_CAPS[game] as number;
  const n = req.iterations;
  if (!Number.isInteger(n) || n < 1) {
    throw new RangeError(`iterations debe ser un entero 1..${cap} para ${game} (recibido: ${String(n)}).`);
  }
  if (n > cap) {
    throw new RangeError(
      `iterations ${n} excede el tope ${cap} para ${game} (máximo permitido: ${cap}).`,
    );
  }
  if (!Number.isInteger(req.seed) || req.seed < 0) {
    throw new RangeError(`seed debe ser un entero >= 0 (recibido: ${String(req.seed)}).`);
  }

  const juego = resolverJuego(game);
  const hitos = hitosPara(n, game);
  const curva: CurvePoint[] = [];
  let nodosFinales: Map<string, RegretNode> | null = null;

  for (const h of hitos) {
    const nodos: Map<string, RegretNode> =
      req.population !== undefined
        ? trainVsPopulation({
            game: juego,
            iterations: h,
            seed: req.seed,
            algorithm,
            population: req.population,
            heroSeats: "alternate",
          }).nodes
        : trainCFR({ game: juego, iterations: h, seed: req.seed, algorithm }).nodes;
    const media = strategyMap({
      nodes: nodos,
      iterations: h,
      seed: req.seed,
      gameName: juego.name,
      algorithm,
    });
    const expl = exploitability(juego, media);
    curva.push({ iteration: h, exploitability: expl });
    if (h === n) nodosFinales = nodos;
  }
  // El último hito siempre es n (ver hitosPara), así que hay nodos finales.
  const nodos = (nodosFinales ?? new Map<string, RegretNode>()) as Map<string, RegretNode>;
  const finalExploitability = curva.length > 0 ? (curva[curva.length - 1] as CurvePoint).exploitability : 0;

  const version = `lab-${req.seed}-${n}`;
  const poblacionCkpt =
    req.population !== undefined
      ? { train: req.population.members.map((m) => m.id), eval: [] as string[] }
      : undefined;
  const checkpoint = toCheckpoint(
    version,
    game,
    req.seed,
    n,
    nodos,
    finalExploitability,
    hashConfig(req, n),
    algorithm,
    poblacionCkpt,
  );

  return {
    game,
    algorithm,
    iterations: n,
    seed: req.seed,
    curve: curva,
    finalExploitability,
    checkpoint,
    elapsedMs: Date.now() - inicio,
  };
}

/**
 * Lista los checkpoints (*.json) de un directorio, ordenados por timestamp
 * descendente. Los ficheros ilegibles o inválidos se saltan en silencio.
 * Un directorio inexistente devuelve [].
 */
export function listCheckpoints(dir = "checkpoints"): CheckpointMeta[] {
  let entradas: string[];
  try {
    if (!fs.existsSync(dir)) return [];
    entradas = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const metas: CheckpointMeta[] = [];
  for (const nombre of entradas) {
    if (!nombre.endsWith(".json")) continue;
    const ruta = path.join(dir, nombre);
    try {
      const cp = loadCheckpoint(ruta);
      metas.push({
        file: ruta,
        version: cp.version,
        algorithm: cp.algorithm,
        game: cp.game,
        seed: cp.seed,
        iterations: cp.iterations,
        exploitability: cp.metrics.exploitability,
        timestamp: cp.timestamp,
      });
    } catch {
      // Fichero ilegible o inválido: se salta.
      continue;
    }
  }
  metas.sort((a, b) => (a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0));
  return metas;
}
