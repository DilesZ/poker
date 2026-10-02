// scripts/experiment.ts — Pipeline de experimentos train → checkpoint → eval (español).
// Uso: npm run experiment -- --name exp-001 --game kuhn --algorithm cfr+ --iterations 10000 --seed 7
//        [--population @f.json] [--eval-baselines tag,nit] [--eval-hands 2000]
//        [--ckpt-out checkpoints/<name>.json] [--out experiments/<name>.json] [--notes "..."]
// Imports RELATIVOS (sin alias "@" en runtime). Sin Math.random: todo por seed.
import * as fs from "node:fs";
import * as path from "node:path";
import { quickTrain } from "../lib/lab/jobs";
import { saveCheckpoint } from "../lib/cfr/checkpoint";
import { BASELINES, type BaselineId } from "../lib/baselines/agent";
import { loadCfrPreflopAgent } from "../lib/cfr/agent";
import { playMatch } from "../lib/eval/match";
import type { PopulationConfig } from "../lib/cfr/population";
import type { EvalEntry, Experiment } from "../lib/experiments/types";
import { saveExperiment } from "../lib/experiments/store";

export type AlgoritmoExp = "cfr" | "cfr+";
export type JuegoExp = "kuhn" | "leduc" | "holdem-hu-preflop";

export interface OpcionesExperiment {
  name: string;
  game: JuegoExp;
  algorithm: AlgoritmoExp;
  iterations: number;
  seed: number;
  population?: PopulationConfig;
  evalBaselines: string[];
  evalHands: number;
  ckptOut: string;
  out: string;
  notes?: string;
  help: boolean;
}

export const TEXTO_USO: string =
  "Uso: npm run experiment -- --name <id> [opciones]\n" +
  "\n" +
  "Opciones:\n" +
  "  --name <id>          identificador del experimento (obligatorio; será id y version)\n" +
  "  --game <id>          juego: kuhn|leduc|holdem-hu-preflop (defecto: kuhn)\n" +
  "  --algorithm <id>     algoritmo: cfr|cfr+ (defecto: cfr+)\n" +
  "  --iterations <n>     nº de iteraciones, entero > 0 (defecto: 10000)\n" +
  "  --seed <n>           semilla RNG, entero >= 0 (defecto: 7)\n" +
  "  --population <json|@fichero>  población train: JSON inline o @ruta (relativa al cwd)\n" +
  "  --eval-baselines <ids>  lista separada por comas (p. ej. tag,nit); SOLO en holdem-hu-preflop\n" +
  "  --eval-hands <n>    manos por evaluación, entero > 0 (defecto: 2000)\n" +
  "  --ckpt-out <ruta>    checkpoint (defecto: checkpoints/<name>.json)\n" +
  "  --out <ruta>         experimento (defecto: experiments/<name>.json)\n" +
  '  --notes "..."        notas libres (opcional)\n' +
  "  --help, -h           muestra esta ayuda\n" +
  "\n" +
  "Ejemplos:\n" +
  "  npm run experiment -- --name exp-001 --game kuhn --algorithm cfr+ --iterations 10000 --seed 7\n" +
  "  npm run experiment -- --name exp-hu-01 --game holdem-hu-preflop --iterations 200 --eval-baselines tag,nit\n";

function parseEnteroPositivo(texto: string, flag: string): number {
  const n = Number(texto);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`Valor inválido para ${flag}: "${texto}". Debe ser un entero > 0.`);
  }
  return n;
}

function parseSemilla(texto: string, flag: string): number {
  const n = Number(texto);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`Valor inválido para ${flag}: "${texto}". Debe ser un entero >= 0.`);
  }
  return n;
}

/** Parsea --population: JSON inline o @ruta (fichero relativo al cwd). */
export function parsePopulationArg(texto: string): PopulationConfig {
  const recortado = texto.trim();
  if (recortado === "") {
    throw new Error("Población vacía: --population necesita JSON inline o @ruta. Usa --help para ver el uso.");
  }
  let jsonTexto = texto;
  if (recortado.startsWith("@")) {
    const rutaFichero = recortado.slice(1).trim();
    if (rutaFichero === "") {
      throw new Error('Población inválida: "@" sin ruta. Usa --population @ruta/al/fichero.json.');
    }
    const resuelta = path.isAbsolute(rutaFichero) ? rutaFichero : path.resolve(process.cwd(), rutaFichero);
    try {
      jsonTexto = fs.readFileSync(resuelta, "utf8");
    } catch {
      throw new Error(`No se pudo leer el fichero de población: "${rutaFichero}". Revisa la ruta.`);
    }
  }
  let datos: unknown;
  try {
    datos = JSON.parse(jsonTexto) as unknown;
  } catch {
    throw new Error("Población con JSON inválido: se esperaba { members: [...] }. Revisa --population.");
  }
  if (datos === null || typeof datos !== "object" || !Array.isArray((datos as Record<string, unknown>)["members"])) {
    throw new Error("Población inválida: se esperaba un objeto con { members: [...] }.");
  }
  return datos as PopulationConfig;
}

function parseJuego(texto: string): JuegoExp {
  if (texto !== "kuhn" && texto !== "leduc" && texto !== "holdem-hu-preflop") {
    throw new Error(`Juego desconocido: "${texto}". Usa --game kuhn|leduc|holdem-hu-preflop.`);
  }
  return texto;
}

function parseAlgoritmo(texto: string): AlgoritmoExp {
  if (texto !== "cfr" && texto !== "cfr+") {
    throw new Error(`Algoritmo desconocido: "${texto}". Usa --algorithm cfr|cfr+.`);
  }
  return texto;
}

function parseEvalBaselines(texto: string): string[] {
  const ids = texto.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
  if (ids.length === 0) {
    throw new Error('Valor inválido para --eval-baselines: vacío. Usa una lista como "tag,nit".');
  }
  const disp = Object.keys(BASELINES);
  for (const id of ids) {
    if (!disp.includes(id)) {
      throw new Error(`Baseline desconocido en --eval-baselines: "${id}". Disponibles: ${disp.join(", ")}.`);
    }
  }
  return ids;
}

/** Parsea argv (sin node ni script). Lanza Error en español si algo es inválido. */
export function parseArgs(argv: string[]): OpcionesExperiment {
  let name = "";
  let game: JuegoExp = "kuhn";
  let algorithm: AlgoritmoExp = "cfr+";
  let iterations = 10000;
  let seed = 7;
  let population: PopulationConfig | undefined;
  let evalBaselines: string[] = [];
  let evalHands = 2000;
  let ckptOut = "";
  let out = "";
  let notes: string | undefined;
  let help = false;

  const tomarValor = (indice: number, flag: string): string => {
    const v: string | undefined = argv[indice];
    if (v === undefined || v.startsWith("-")) {
      throw new Error(`Falta valor para ${flag}. Usa --help para ver el uso.`);
    }
    return v;
  };
  const tomarPar = (arg: string, i: number, flag: string, prefijo: string): { valor: string; salto: number } => {
    if (arg.startsWith(prefijo)) return { valor: arg.slice(prefijo.length), salto: 0 };
    if (arg === flag) return { valor: tomarValor(i + 1, flag), salto: 1 };
    throw new Error("interno");
  };

  for (let i = 0; i < argv.length; i++) {
    const arg: string = argv[i] ?? "";
    if (arg === "--help" || arg === "-h") {
      help = true;
    } else if (arg === "--name" || arg.startsWith("--name=")) {
      const r = tomarPar(arg, i, "--name", "--name=");
      name = r.valor; i += r.salto;
    } else if (arg === "--game" || arg.startsWith("--game=")) {
      const r = tomarPar(arg, i, "--game", "--game=");
      game = parseJuego(r.valor); i += r.salto;
    } else if (arg === "--algorithm" || arg.startsWith("--algorithm=")) {
      const r = tomarPar(arg, i, "--algorithm", "--algorithm=");
      algorithm = parseAlgoritmo(r.valor); i += r.salto;
    } else if (arg === "--iterations" || arg.startsWith("--iterations=")) {
      const r = tomarPar(arg, i, "--iterations", "--iterations=");
      iterations = parseEnteroPositivo(r.valor, "--iterations"); i += r.salto;
    } else if (arg === "--seed" || arg.startsWith("--seed=")) {
      const r = tomarPar(arg, i, "--seed", "--seed=");
      seed = parseSemilla(r.valor, "--seed"); i += r.salto;
    } else if (arg === "--population" || arg.startsWith("--population=")) {
      const r = tomarPar(arg, i, "--population", "--population=");
      population = parsePopulationArg(r.valor); i += r.salto;
    } else if (arg === "--eval-baselines" || arg.startsWith("--eval-baselines=")) {
      const r = tomarPar(arg, i, "--eval-baselines", "--eval-baselines=");
      evalBaselines = parseEvalBaselines(r.valor); i += r.salto;
    } else if (arg === "--eval-hands" || arg.startsWith("--eval-hands=")) {
      const r = tomarPar(arg, i, "--eval-hands", "--eval-hands=");
      evalHands = parseEnteroPositivo(r.valor, "--eval-hands"); i += r.salto;
    } else if (arg === "--ckpt-out" || arg.startsWith("--ckpt-out=")) {
      const r = tomarPar(arg, i, "--ckpt-out", "--ckpt-out=");
      ckptOut = r.valor; i += r.salto;
    } else if (arg === "--out" || arg.startsWith("--out=")) {
      const r = tomarPar(arg, i, "--out", "--out=");
      out = r.valor; i += r.salto;
    } else if (arg === "--notes" || arg.startsWith("--notes=")) {
      const r = tomarPar(arg, i, "--notes", "--notes=");
      notes = r.valor; i += r.salto;
    } else if (arg.trim() === "") {
      // Ignora huecos accidentales.
    } else {
      throw new Error(`Flag desconocida: "${arg}". Usa --help para ver el uso.`);
    }
  }

  if (!help) {
    if (name.trim() === "") {
      throw new Error("Falta --name: el experimento necesita un identificador. Usa --help para ver el uso.");
    }
    if (ckptOut.trim() === "") ckptOut = `checkpoints/${name}.json`;
    if (out.trim() === "") out = `experiments/${name}.json`;
    if (evalBaselines.length > 0 && game !== "holdem-hu-preflop") {
      throw new Error(
        `Transfer solo en holdem-hu-preflop: --eval-baselines no aplica a "${game}". ` +
          "Quita el flag o usa --game holdem-hu-preflop.",
      );
    }
  }
  return { name, game, algorithm, iterations, seed, population, evalBaselines, evalHands, ckptOut, out, notes, help };
}

export interface ResultadoExperimento {
  experimento: Experiment;
  rutaCheckpoint: string;
  rutaExperimento: string;
}

/**
 * Ejecuta el pipeline completo: entrena, guarda el checkpoint (version=name),
 * evalúa transferencia contra baselines (solo HU) y persiste el experimento.
 * Lanza Error en español si algo falla. Sin Math.random.
 */
export function runExperiment(opts: OpcionesExperiment): ResultadoExperimento {
  if (opts.evalBaselines.length > 0 && opts.game !== "holdem-hu-preflop") {
    throw new Error(
      `Transfer solo en holdem-hu-preflop: --eval-baselines no aplica a "${opts.game}". ` +
        "Quita el flag o usa --game holdem-hu-preflop.",
    );
  }
  const entrenado = quickTrain({
    game: opts.game,
    algorithm: opts.algorithm,
    iterations: opts.iterations,
    seed: opts.seed,
    ...(opts.population !== undefined ? { population: opts.population } : {}),
  });
  const cpVersionado = { ...entrenado.checkpoint, version: opts.name };
  saveCheckpoint(opts.ckptOut, cpVersionado);

  const evaluaciones: EvalEntry[] = [];
  if (opts.game === "holdem-hu-preflop") {
    opts.evalBaselines.forEach((id, idx) => {
      // Agente fresco por oponente: los contadores misses/postflop son por rival.
      const heroe = loadCfrPreflopAgent(opts.ckptOut, "tag");
      const rival = (BASELINES as Record<string, (typeof BASELINES)[BaselineId]>)[id];
      if (!rival) {
        const disp = Object.keys(BASELINES).join(", ");
        throw new Error(`Baseline desconocido en --eval-baselines: "${id}". Disponibles: ${disp}.`);
      }
      // Seed por oponente = seed base + índice (determinista, barajas distintas).
      const semillaEval = opts.seed + idx;
      const res = playMatch(heroe, rival, { hands: opts.evalHands, seed: semillaEval });
      evaluaciones.push({
        opponent: id,
        hands: opts.evalHands,
        seed: semillaEval,
        bb100: res.bb100A,
        ci95: [res.ci95[0], res.ci95[1]],
        extra: { misses: heroe.misses(), fallbacksPostflop: heroe.fallbacksPostflop() },
      });
    });
  }

  const experimento: Experiment = {
    id: opts.name,
    name: opts.name,
    createdAt: new Date().toISOString(),
    algorithm: opts.algorithm,
    game: opts.game,
    iterations: opts.iterations,
    seed: opts.seed,
    ...(opts.population !== undefined
      ? { populationTrainIds: opts.population.members.map((m) => m.id) }
      : {}),
    abstraction: opts.game === "holdem-hu-preflop" ? "buckets-12" : "exact",
    checkpoint: {
      path: opts.ckptOut,
      version: opts.name,
      exploitability: entrenado.finalExploitability,
    },
    curve: entrenado.curve.map((p) => ({ iteration: p.iteration, exploitability: p.exploitability })),
    evaluations: evaluaciones,
    ...(opts.notes !== undefined ? { notes: opts.notes } : {}),
  };
  const rutaExperimento = saveExperiment(path.dirname(opts.out), experimento);
  return { experimento, rutaCheckpoint: opts.ckptOut, rutaExperimento };
}

function main(): void {
  let opts: OpcionesExperiment;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    console.error(TEXTO_USO);
    process.exitCode = 1;
    return;
  }
  if (opts.help) {
    console.log(TEXTO_USO);
    return;
  }
  try {
    const { experimento, rutaCheckpoint, rutaExperimento } = runExperiment(opts);
    console.log(`experimento: ${experimento.id}`);
    console.log(`juego: ${experimento.game} | algoritmo: ${experimento.algorithm} | iters: ${experimento.iterations} | seed: ${experimento.seed}`);
    console.log(`exploitability: ${experimento.checkpoint.exploitability}`);
    console.log(`evaluaciones: ${experimento.evaluations.length}`);
    console.log(`checkpoint: ${rutaCheckpoint}`);
    console.log(`ruta: ${rutaExperimento}`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  }
}

function esEjecucionDirecta(): boolean {
  const ejecutado: string = process.argv[1] ?? "";
  return ejecutado.endsWith("experiment.ts") || ejecutado.endsWith("experiment.js");
}

if (esEjecucionDirecta()) {
  main();
}
