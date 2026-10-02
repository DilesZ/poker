// scripts/train.ts — CLI de entrenamiento CFR tabular (P4).
// Uso: npm run train -- --algorithm cfr --game kuhn --iterations 50000 --seed 12345 --out checkpoints/kuhn-cfr-v1.json
// Solo "cfr" en P4 (cfr+ es P5). Importa juegos por ruta relativa (sin alias "@" en runtime).
import * as ruta from "node:path";
import { exploitability } from "../lib/cfr/exploit";
import { saveCheckpoint, toCheckpoint } from "../lib/cfr/checkpoint";
import { strategyMap, trainCFR } from "../lib/cfr/trainer";
import type { CFRGame } from "../lib/cfr/game";
import * as moduloKuhn from "../lib/games/kuhn";
import * as moduloLeduc from "../lib/games/leduc";

export interface OpcionesTrain {
  algorithm: string;
  game: string;
  iterations: number;
  seed: number;
  out: string;
  help: boolean;
}

export const TEXTO_USO: string =
  "Uso: npm run train -- [opciones]\n" +
  "\n" +
  "Opciones:\n" +
  "  --algorithm <id>  algoritmo (defecto: cfr; solo cfr en P4)\n" +
  "  --game <id>       juego: kuhn|leduc (defecto: kuhn)\n" +
  "  --iterations <n>  nº de iteraciones, entero > 0 (defecto: 50000)\n" +
  "  --seed <n>        semilla RNG, entero >= 0 (defecto: 12345)\n" +
  "  --out <ruta>      ruta del checkpoint (defecto: checkpoints/kuhn-cfr-v1.json)\n" +
  "  --help, -h        muestra esta ayuda\n" +
  "\n" +
  "Ejemplos:\n" +
  "  npm run train -- --algorithm cfr --game kuhn --iterations 50000 --seed 12345 --out checkpoints/kuhn-cfr-v1.json";

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

/** Parsea argv (sin node ni script). Lanza Error en español si algo es inválido. */
export function parseArgs(argv: string[]): OpcionesTrain {
  let algorithm = "cfr";
  let game = "kuhn";
  let iterations = 50000;
  let seed = 12345;
  let out = "checkpoints/kuhn-cfr-v1.json";
  let help = false;

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
      algorithm = arg.slice("--algorithm=".length);
    } else if (arg === "--algorithm") {
      algorithm = tomarValor(i + 1, "--algorithm");
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
    } else if (arg.trim() === "") {
      // Ignora huecos accidentales.
    } else {
      throw new Error(`Flag desconocida: "${arg}". Usa --help para ver el uso.`);
    }
  }

  if (!help) {
    if (algorithm !== "cfr") {
      throw new Error(`Algoritmo "${algorithm}" no disponible en P4 (P5 pendiente). Usa --algorithm cfr.`);
    }
    if (game !== "kuhn" && game !== "leduc") {
      throw new Error(`Juego desconocido: "${game}". Usa --game kuhn|leduc.`);
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
  return { algorithm, game, iterations, seed, out, help };
}

/** Hash simple (djb2, hex 8) de "algorithm|game|iterations|seed". */
export function hashConfig(algorithm: string, game: string, iterations: number, seed: number): string {
  const texto = `${algorithm}|${game}|${iterations}|${seed}`;
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
  const modulo = opts.game === "leduc" ? moduloLeduc : moduloKuhn;
  let juego: CFRGame;
  try {
    juego = extraerJuego(modulo, opts.game);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
    return;
  }
  const resultado = trainCFR({ game: juego, iterations: opts.iterations, seed: opts.seed });
  const media = strategyMap(resultado);
  const expl = exploitability(juego, media);
  const configHash = hashConfig(opts.algorithm, opts.game, opts.iterations, opts.seed);
  const cp = toCheckpoint(
    versionDe(opts.out),
    opts.game,
    opts.seed,
    opts.iterations,
    resultado.nodes,
    expl,
    configHash,
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
  console.log(`out: ${opts.out}`);
}

function esEjecucionDirecta(): boolean {
  const ejecutado: string = process.argv[1] ?? "";
  return ejecutado.endsWith("train.ts") || ejecutado.endsWith("train.js");
}

if (esEjecucionDirecta()) {
  main();
}
