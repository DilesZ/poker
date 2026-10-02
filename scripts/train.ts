// scripts/train.ts — CLI de entrenamiento CFR tabular (P4 vanilla + P5 CFR+).
// Uso: npm run train -- --algorithm cfr --game kuhn --iterations 50000 --seed 12345 --out checkpoints/kuhn-cfr-v1.json
// Acepta --algorithm cfr|cfr+. Importa juegos por ruta relativa (sin alias "@" en runtime).
import * as ruta from "node:path";
import * as fs from "node:fs";
import { exploitability } from "../lib/cfr/exploit";
import { saveCheckpoint, toCheckpoint } from "../lib/cfr/checkpoint";
import { strategyMap, trainCFR } from "../lib/cfr/trainer";
import type { PopulationConfig, PopTrainResult } from "../lib/cfr/population";
import { trainVsPopulation, validateDisjoint } from "../lib/cfr/population";
import type { CFRGame } from "../lib/cfr/game";
import * as moduloKuhn from "../lib/games/kuhn";
import * as moduloLeduc from "../lib/games/leduc";
import { holdemHuGame } from "../lib/games/holdem-hu";
import { loadEvTable, loadEvTie } from "../lib/games/buckets";

export type AlgoritmoTrain = "cfr" | "cfr+";

export interface OpcionesTrain {
  algorithm: AlgoritmoTrain;
  game: string;
  iterations: number;
  seed: number;
  out: string;
  help: boolean;
  /** Población train (P6). Ausente = self-play puro (camino actual). */
  population?: PopulationConfig;
  /** Población eval (P6). Opcional; si viene debe ser disjunta de train. */
  evalPopulation?: PopulationConfig;
}

export const TEXTO_USO: string =
  "Uso: npm run train -- [opciones]\n" +
  "\n" +
  "Opciones:\n" +
  "  --algorithm <id>  algoritmo: cfr|cfr+ (defecto: cfr)\n" +
  "  --game <id>       juego: kuhn|leduc|holdem-hu-preflop (defecto: kuhn)\n" +
  "  --iterations <n>  nº de iteraciones, entero > 0 (defecto: 50000)\n" +
  "  --seed <n>        semilla RNG, entero >= 0 (defecto: 12345)\n" +
  "  --out <ruta>      ruta del checkpoint (defecto: checkpoints/kuhn-cfr-v1.json)\n" +
  "  --population <json|@fichero>       población train P6: JSON con forma PopulationConfig\n" +
  "                                     ({ members: [{ id, kind, weight, checkpointPath? }] });\n" +
  "                                     con `@ruta` se lee el fichero (relativo al cwd).\n" +
  "                                     Ausente = self-play puro (camino actual intacto).\n" +
  "  --eval-population <json|@fichero>  población eval P6 (opcional; debe ser disjunta\n" +
  "                                     de train; sus ids van al checkpoint)\n" +
  "  --help, -h        muestra esta ayuda\n" +
  "\n" +
  "Ejemplos:\n" +
  "  npm run train -- --algorithm cfr --game kuhn --iterations 50000 --seed 12345 --out checkpoints/kuhn-cfr-v1.json\n" +
  "  npm run train -- --game kuhn --iterations 2000 --population '{\"members\":[{\"id\":\"self\",\"kind\":\"self\",\"weight\":1}]}'";

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

/** Valida el flag --algorithm (cfr|cfr+). Lanza Error en español si es otro. */
function parseAlgoritmo(texto: string): AlgoritmoTrain {
  if (texto !== "cfr" && texto !== "cfr+") {
    throw new Error(`Algoritmo desconocido: "${texto}". Usa --algorithm cfr|cfr+.`);
  }
  return texto;
}

/**
 * Parsea el valor de --population / --eval-population.
 * Acepta JSON inline o `@ruta` (fichero leído relativo al cwd).
 * Lanza Error en español si el fichero no se lee o el JSON es inválido.
 */
export function parsePopulationArg(texto: string): PopulationConfig {
  const recortado = texto.trim();
  if (recortado === "") {
    throw new Error(
      "Población vacía: --population/--eval-population necesita JSON inline o @ruta. Usa --help para ver el uso.",
    );
  }
  let jsonTexto = texto;
  if (recortado.startsWith("@")) {
    const rutaFichero = recortado.slice(1).trim();
    if (rutaFichero === "") {
      throw new Error('Población inválida: "@" sin ruta. Usa --population @ruta/al/fichero.json.');
    }
    const resuelta = ruta.isAbsolute(rutaFichero) ? rutaFichero : ruta.resolve(process.cwd(), rutaFichero);
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
    throw new Error(
      "Población con JSON inválido: se esperaba un PopulationConfig con { members: [...] }. Revisa --population/--eval-population.",
    );
  }
  if (
    datos === null ||
    typeof datos !== "object" ||
    !Array.isArray((datos as Record<string, unknown>)["members"])
  ) {
    throw new Error(
      "Población inválida: se esperaba un objeto con { members: [...] } donde cada miembro tiene { id, kind, weight }. Revisa --population/--eval-population.",
    );
  }
  return datos as PopulationConfig;
}

/** Parsea argv (sin node ni script). Lanza Error en español si algo es inválido. */
export function parseArgs(argv: string[]): OpcionesTrain {
  let algorithm: AlgoritmoTrain = "cfr";
  let game = "kuhn";
  let iterations = 50000;
  let seed = 12345;
  let out = "checkpoints/kuhn-cfr-v1.json";
  let help = false;
  let population: PopulationConfig | undefined;
  let evalPopulation: PopulationConfig | undefined;

  const tomarValor = (indice: number, flag: string): string => {
    const v: string | undefined = argv[indice];
    if (v === undefined || v.startsWith("-")) {
      throw new Error(`Falta valor para ${flag}. Usa --help para ver el uso.`);
    }
    return v;
  };

  for (let i = 0; i < argv.length; i++) {
    const arg: string = argv[i] ?? "";
    if (arg === "--help" || arg === "-h") {
      help = true;
    } else if (arg.startsWith("--algorithm=")) {
      algorithm = parseAlgoritmo(arg.slice("--algorithm=".length));
    } else if (arg === "--algorithm") {
      algorithm = parseAlgoritmo(tomarValor(i + 1, "--algorithm"));
      i++;
    } else if (arg.startsWith("--game=")) {
      game = arg.slice("--game=".length);
    } else if (arg === "--game") {
      game = tomarValor(i + 1, "--game");
      i++;
    } else if (arg.startsWith("--iterations=")) {
      iterations = parseEnteroPositivo(arg.slice("--iterations=".length), "--iterations");
    } else if (arg === "--iterations") {
      iterations = parseEnteroPositivo(tomarValor(i + 1, "--iterations"), "--iterations");
      i++;
    } else if (arg.startsWith("--seed=")) {
      seed = parseSemilla(arg.slice("--seed=".length), "--seed");
    } else if (arg === "--seed") {
      seed = parseSemilla(tomarValor(i + 1, "--seed"), "--seed");
      i++;
    } else if (arg.startsWith("--out=")) {
      out = arg.slice("--out=".length);
    } else if (arg === "--out") {
      out = tomarValor(i + 1, "--out");
      i++;
    } else if (arg.startsWith("--population=")) {
      population = parsePopulationArg(arg.slice("--population=".length));
    } else if (arg === "--population") {
      population = parsePopulationArg(tomarValor(i + 1, "--population"));
      i++;
    } else if (arg.startsWith("--eval-population=")) {
      evalPopulation = parsePopulationArg(arg.slice("--eval-population=".length));
    } else if (arg === "--eval-population") {
      evalPopulation = parsePopulationArg(tomarValor(i + 1, "--eval-population"));
      i++;
    } else if (arg.trim() === "") {
      // Ignora huecos accidentales.
    } else {
      throw new Error(`Flag desconocida: "${arg}". Usa --help para ver el uso.`);
    }
  }

  if (!help) {
    if (algorithm !== "cfr" && algorithm !== "cfr+") {
      throw new Error(`Algoritmo desconocido: "${algorithm}". Usa --algorithm cfr|cfr+.`);
    }
    if (game !== "kuhn" && game !== "leduc" && game !== "holdem-hu-preflop") {
      throw new Error(`Juego desconocido: "${game}". Usa --game kuhn|leduc|holdem-hu-preflop.`);
    }
    if (!Number.isInteger(iterations) || iterations <= 0) {
      throw new Error(`Valor inválido para --iterations: "${iterations}". Debe ser un entero > 0.`);
    }
    if (!Number.isInteger(seed) || seed < 0) {
      throw new Error(`Valor inválido para --seed: "${seed}". Debe ser un entero >= 0.`);
    }
    if (out.trim() === "") {
      throw new Error('Valor inválido para --out: vacío. Usa --help para ver el uso.');
    }
  }
  return { algorithm, game, iterations, seed, out, help, population, evalPopulation };
}

/** Hash simple (djb2, hex 8) de "algorithm|game|iterations|seed[|pop:ids]".
 * Sin populationIds el hash es el de siempre (compat con checkpoints P4/P5). */
export function hashConfig(
  algorithm: string,
  game: string,
  iterations: number,
  seed: number,
  populationIds?: string[],
): string {
  const base = `${algorithm}|${game}|${iterations}|${seed}`;
  const texto =
    populationIds !== undefined && populationIds.length > 0
      ? `${base}|pop:${populationIds.join(",")}`
      : base;
  let h = 5381;
  for (let i = 0; i < texto.length; i++) {
    h = ((h << 5) + h + texto.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

function esJuego(valor: unknown): valor is CFRGame {
  if (valor === null || typeof valor !== "object") {
    return false;
  }
  const reg = valor as Record<string, unknown>;
  return typeof reg["newInitial"] === "function";
}

/**
 * Localiza el objeto CFRGame dentro del módulo del juego. Tolera distintas
 * formas de exportarlo (default, nombrado o factoría sin argumentos).
 */
function extraerJuego(modulo: unknown, nombre: string): CFRGame {
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
  throw new Error(`No se encontró el juego "${nombre}" en su módulo. Revisa lib/games/${nombre}.ts.`);
}

/** Versión del checkpoint: nombre del archivo de salida sin extensión. */
function versionDe(out: string): string {
  const base = ruta.basename(out);
  if (base.toLowerCase().endsWith(".json")) {
    const sinExt = base.slice(0, -".json".length);
    if (sinExt.length > 0) {
      return sinExt;
    }
  } else if (base.length > 0) {
    return base;
  }
  return "cfr-v1";
}

function main(): void {
  let opts: OpcionesTrain;
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
  // P6: la población eval debe ser disjunta de train (throw → error claro + exit 1).
  if (opts.population !== undefined && opts.evalPopulation !== undefined) {
    try {
      validateDisjoint(opts.population, opts.evalPopulation);
    } catch (err) {
      console.error(err instanceof Error ? err.message : err);
      process.exitCode = 1;
      return;
    }
  }
  const modulo = opts.game === "leduc" ? moduloLeduc : moduloKuhn;
  let juego: CFRGame;
  if (opts.game === "holdem-hu-preflop") {
    try {
      // La tabla EV la genera `npm run compute-ev` (ver lib/games/buckets.ts).
      juego = holdemHuGame(loadEvTable(), loadEvTie());
    } catch (err) {
      console.error(err instanceof Error ? err.message : err);
      process.exitCode = 1;
      return;
    }
  } else {
    try {
      juego = extraerJuego(modulo, opts.game);
    } catch (err) {
      console.error(err instanceof Error ? err.message : err);
      process.exitCode = 1;
      return;
    }
  }
  const poblacion: PopulationConfig | undefined = opts.population;
  const idsTrain: string[] =
    poblacion !== undefined ? poblacion.members.map((m) => m.id) : [];
  const idsEval: string[] =
    poblacion !== undefined && opts.evalPopulation !== undefined
      ? opts.evalPopulation.members.map((m) => m.id)
      : [];
  const resultado =
    poblacion !== undefined
      ? trainVsPopulation({
          game: juego,
          iterations: opts.iterations,
          seed: opts.seed,
          algorithm: opts.algorithm,
          population: poblacion,
          heroSeats: "alternate",
        })
      : trainCFR({ game: juego, iterations: opts.iterations, seed: opts.seed, algorithm: opts.algorithm });
  // Solo existe en el camino con población (PopTrainResult).
  const conteos: Record<string, number> | undefined =
    poblacion !== undefined ? (resultado as PopTrainResult).opponentCounts : undefined;
  const media = strategyMap(resultado);
  const expl = exploitability(juego, media);
  const configHash =
    idsTrain.length > 0 || idsEval.length > 0
      ? hashConfig(opts.algorithm, opts.game, opts.iterations, opts.seed, [...idsTrain, ...idsEval])
      : hashConfig(opts.algorithm, opts.game, opts.iterations, opts.seed);
  const cp = toCheckpoint(
      versionDe(opts.out),
      opts.game,
      opts.seed,
      opts.iterations,
      resultado.nodes,
      expl,
      configHash,
      opts.algorithm,
      poblacion !== undefined ? { train: idsTrain, eval: idsEval } : undefined,
    );
  try {
    saveCheckpoint(opts.out, cp);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
    return;
  }
  console.log(`algoritmo: ${opts.algorithm}`);
  console.log(`juego: ${opts.game}`);
  console.log(`iteraciones: ${opts.iterations}`);
  console.log(`exploitability: ${expl}`);
  if (conteos !== undefined) {
    console.log(`population train: ${idsTrain.join(",")}`);
    console.log(`population eval: ${idsEval.join(",")}`);
    console.log(`opponentCounts: ${JSON.stringify(conteos)}`);
  }
  console.log(`out: ${opts.out}`);
}

function esEjecucionDirecta(): boolean {
  const ejecutado: string = process.argv[1] ?? "";
  return ejecutado.endsWith("train.ts") || ejecutado.endsWith("train.js");
}

if (esEjecucionDirecta()) {
  main();
}
