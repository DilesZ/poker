// scripts/eval-cfr.ts — CLI: duelo heads-up entre el agente CFR preflop y un baseline.
// Uso: tsx scripts/eval-cfr.ts --ckpt <ruta> --b <baselineId> --hands N --seed S [--fallback tag]
// Defaults: --fallback tag, --hands 2000, --seed 7. Sin Math.random (el match
// es determinista dado seed). Imports RELATIVOS para que tsx resuelva sin el
// alias "@" en runtime.
import { BASELINES, type BaselineId } from "../lib/baselines/agent";
import { loadCfrPreflopAgent } from "../lib/cfr/agent";
import { playMatch } from "../lib/eval/match";
import { formatTable } from "./evaluate";

export interface OpcionesEvalCfr {
  ckpt: string;
  b: BaselineId;
  hands: number;
  seed: number;
  fallback: BaselineId;
  help: boolean;
}

export const TEXTO_USO: string =
  "Uso: tsx scripts/eval-cfr.ts [opciones]\n" +
  "\n" +
  "Opciones:\n" +
  "  --ckpt <ruta>    ruta del checkpoint CFR (obligatorio)\n" +
  "  --b <id>         baseline rival (obligatorio)\n" +
  "  --hands <n>      nº de manos, entero > 0 (defecto: 2000)\n" +
  "  --seed <n>       semilla RNG, entero >= 0 (defecto: 7)\n" +
  "  --fallback <id>  baseline de respaldo preflop-miss y postflop (defecto: tag)\n" +
  "  --help, -h       muestra esta ayuda\n" +
  "\n" +
  "Ids esperados (se validan contra BASELINES):\n" +
  "  random, calling-station, nit, tag, lag, maniac, gto-lite\n" +
  "\n" +
  "Ejemplos:\n" +
  "  tsx scripts/eval-cfr.ts --ckpt checkpoints/holdem-hu-cfr-v1.json --b random --hands 2000 --seed 7\n" +
  "  tsx scripts/eval-cfr.ts --ckpt checkpoints/holdem-hu-cfr-v1.json --b tag --hands 5000 --seed 1 --fallback nit";

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

function afirmarBaselineExiste(id: string, flag: string): asserts id is BaselineId {
  const disp = Object.keys(BASELINES).join(", ");
  if (!Object.prototype.hasOwnProperty.call(BASELINES, id)) {
    throw new Error(`Baseline desconocido para ${flag}: "${id}". Disponibles: ${disp}.`);
  }
}

/**
 * Parsea argv (sin node ni script). Lanza Error en español si hay flags
 * desconocidos, valores ausentes/inválidos o faltan --ckpt / --b.
 */
export function parseArgs(argv: string[]): OpcionesEvalCfr {
  let ckpt = "";
  let b = "";
  let hands = 2000;
  let seed = 7;
  let fallback = "tag";
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
    } else if (arg.startsWith("--ckpt=")) {
      ckpt = arg.slice("--ckpt=".length);
    } else if (arg === "--ckpt") {
      ckpt = tomarValor(i + 1, "--ckpt");
      i++;
    } else if (arg.startsWith("--b=")) {
      b = arg.slice("--b=".length);
    } else if (arg === "--b") {
      b = tomarValor(i + 1, "--b");
      i++;
    } else if (arg.startsWith("--hands=")) {
      hands = parseEnteroPositivo(arg.slice("--hands=".length), "--hands");
    } else if (arg === "--hands") {
      hands = parseEnteroPositivo(tomarValor(i + 1, "--hands"), "--hands");
      i++;
    } else if (arg.startsWith("--seed=")) {
      seed = parseSemilla(arg.slice("--seed=".length), "--seed");
    } else if (arg === "--seed") {
      seed = parseSemilla(tomarValor(i + 1, "--seed"), "--seed");
      i++;
    } else if (arg.startsWith("--fallback=")) {
      fallback = arg.slice("--fallback=".length);
    } else if (arg === "--fallback") {
      fallback = tomarValor(i + 1, "--fallback");
      i++;
    } else if (arg.trim() === "") {
      // Ignora huecos accidentales.
    } else {
      throw new Error(`Flag desconocida: "${arg}". Usa --help para ver el uso.`);
    }
  }

  if (help) {
    return { ckpt, b: (b || "random") as BaselineId, hands, seed, fallback: fallback as BaselineId, help };
  }
  if (ckpt.trim() === "") {
    throw new Error('Falta --ckpt <ruta>. Usa --help para ver el uso.');
  }
  if (b.trim() === "") {
    throw new Error('Falta --b <baselineId>. Usa --help para ver el uso.');
  }
  afirmarBaselineExiste(b, "--b");
  afirmarBaselineExiste(fallback, "--fallback");
  return { ckpt, b: b as BaselineId, hands, seed, fallback: fallback as BaselineId, help };
}

function main(): void {
  let opts: OpcionesEvalCfr;
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
    console.log(`\nIds registrados: ${Object.keys(BASELINES).join(", ")}.`);
    return;
  }
  let agenteCfr: ReturnType<typeof loadCfrPreflopAgent>;
  try {
    agenteCfr = loadCfrPreflopAgent(opts.ckpt, opts.fallback);
  } catch (err) {
    console.error(`No se pudo cargar el agente CFR: ${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
    return;
  }
  const rival = BASELINES[opts.b];
  if (!rival) {
    console.error(`Baseline desconocido para --b: "${opts.b}".`);
    process.exitCode = 1;
    return;
  }
  let resultado: ReturnType<typeof playMatch>;
  try {
    resultado = playMatch(agenteCfr, rival, { hands: opts.hands, seed: opts.seed });
  } catch (err) {
    console.error(`Fallo el match cfr-preflop vs ${opts.b}: ${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
    return;
  }
  console.log(formatTable(resultado, "cfr-preflop", String(opts.b)));
  const misses = agenteCfr.misses();
  const post = agenteCfr.fallbacksPostflop();
  const tasa = opts.hands > 0 ? (misses / opts.hands) * 100 : 0;
  console.log(
    JSON.stringify({
      ckpt: opts.ckpt,
      fallback: opts.fallback,
      b: opts.b,
      hands: opts.hands,
      seed: opts.seed,
      bb100A: resultado.bb100A,
      sdPorManoBB: resultado.sdPorManoBB,
      ci95: resultado.ci95,
      statsA: resultado.statsA,
      statsB: resultado.statsB,
      misses,
      fallbacksPostflop: post,
      missRatePct: tasa,
    }),
  );
}

function esEjecucionDirecta(): boolean {
  const ejecutado: string = process.argv[1] ?? "";
  return ejecutado.endsWith("eval-cfr.ts") || ejecutado.endsWith("eval-cfr.js");
}

if (esEjecucionDirecta()) {
  main();
}
