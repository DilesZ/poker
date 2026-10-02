// scripts/evaluate.ts — CLI heads-up entre dos baselines con tabla bb/100 e IC95%.
// Uso: npm run evaluate -- --a tag --b random --hands 10000 --seed 7 --stack 1000 --sb 10 --bb 20 [--json]
// Contrato: lib/baselines/agent.ts (BASELINES) y lib/eval/match.ts (playMatch) los escriben otros agentes.
// Se usan imports RELATIVOS para que tsx resuelva sin depender del alias "@" en runtime.
import { BASELINES, type BaselineId } from "../lib/baselines/agent";
import { playMatch } from "../lib/eval/match";

// Tipos derivados del contrato (evitan depender del nombre exportado MatchResult).
export type AgenteBaseline = Parameters<typeof playMatch>[0];
export type OpcionesMatch = Parameters<typeof playMatch>[2];
export type ResultadoMatch = Awaited<ReturnType<typeof playMatch>>;

export interface OpcionesEvaluate {
  a: BaselineId;
  b: BaselineId;
  hands: number;
  seed: number;
  stack: number;
  sb: number;
  bb: number;
  json: boolean;
  help: boolean;
}

export const TEXTO_USO: string =
  "Uso: npm run evaluate -- [opciones]\n" +
  "\n" +
  "Opciones:\n" +
  "  --a <id>      baseline A (defecto: tag)\n" +
  "  --b <id>      baseline B (defecto: random)\n" +
  "  --hands <n>   nº de manos, entero > 0 (defecto: 10000)\n" +
  "  --seed <n>    semilla RNG, entero >= 0 (defecto: 7)\n" +
  "  --stack <n>   stack inicial por jugador, entero > 0 (defecto: 1000)\n" +
  "  --sb <n>      ciega pequeña, entero > 0 (defecto: 10)\n" +
  "  --bb <n>      ciega grande, entero > 0 (defecto: 20)\n" +
  "  --json        vuelca el MatchResult JSON en vez de la tabla\n" +
  "  --help, -h    muestra esta ayuda\n" +
  "\n" +
  "Ids esperados (se validan contra BASELINES):\n" +
  "  random, calling-station, nit, tag, lag, maniac, gto-lite\n" +
  "\n" +
  "Ejemplos:\n" +
  "  npm run evaluate -- --a tag --b random --hands 10000 --seed 7\n" +
  "  npm run evaluate -- --a nit --b calling-station --hands 2000 --seed 1 --json";

/** Lista los ids registrados en BASELINES (tolera Record, Array o Map). */
function idsDisponibles(): string[] {
  const b: unknown = BASELINES;
  if (Array.isArray(b)) {
    const lista = b as Array<{ id?: unknown }>;
    return lista
      .map((e) => (typeof e?.id === "string" ? e.id : ""))
      .filter((s) => s.length > 0);
  }
  if (b instanceof Map) {
    return [...(b as Map<unknown, unknown>).keys()].map((k) => String(k));
  }
  if (b !== null && typeof b === "object") {
    return Object.keys(b as Record<string, unknown>);
  }
  return [];
}

function afirmarBaselineExiste(id: string, flag: string): void {
  if (!idsDisponibles().includes(id)) {
    const disp = idsDisponibles().join(", ") || "s/d";
    throw new Error(`Baseline desconocido para ${flag}: "${id}". Disponibles: ${disp}.`);
  }
}

function obtenerBaseline(id: string): AgenteBaseline {
  const b: unknown = BASELINES;
  if (Array.isArray(b)) {
    const lista = b as Array<{ id?: unknown }>;
    const hallado = lista.find((e) => e?.id === id);
    if (hallado !== undefined) return hallado as unknown as AgenteBaseline;
  } else if (b instanceof Map) {
    const mapa = b as Map<unknown, unknown>;
    if (mapa.has(id)) return mapa.get(id) as AgenteBaseline;
  } else if (b !== null && typeof b === "object") {
    const reg = b as Record<string, unknown>;
    if (reg[id] !== undefined) return reg[id] as AgenteBaseline;
  }
  const disp = idsDisponibles().join(", ") || "s/d";
  throw new Error(`Baseline desconocido: "${id}". Disponibles: ${disp}.`);
}

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

/**
 * Parsea argv (sin node ni script). Lanza Error en español si hay flags
 * desconocidos, valores ausentes/inválidos o ids ajenos a BASELINES.
 */
export function parseArgs(argv: string[]): OpcionesEvaluate {
  let a = "tag";
  let b = "random";
  let hands = 10000;
  let seed = 7;
  let stack = 1000;
  let sb = 10;
  let bb = 20;
  let json = false;
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
    } else if (arg === "--json") {
      const siguiente: string | undefined = argv[i + 1];
      if (siguiente === "true") {
        json = true;
        i++;
      } else if (siguiente === "false") {
        json = false;
        i++;
      } else {
        json = true;
      }
    } else if (arg.startsWith("--a=")) {
      a = arg.slice("--a=".length);
    } else if (arg === "--a") {
      a = tomarValor(i + 1, "--a");
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
    } else if (arg.startsWith("--stack=")) {
      stack = parseEnteroPositivo(arg.slice("--stack=".length), "--stack");
    } else if (arg === "--stack") {
      stack = parseEnteroPositivo(tomarValor(i + 1, "--stack"), "--stack");
      i++;
    } else if (arg.startsWith("--sb=")) {
      sb = parseEnteroPositivo(arg.slice("--sb=".length), "--sb");
    } else if (arg === "--sb") {
      sb = parseEnteroPositivo(tomarValor(i + 1, "--sb"), "--sb");
      i++;
    } else if (arg.startsWith("--bb=")) {
      bb = parseEnteroPositivo(arg.slice("--bb=".length), "--bb");
    } else if (arg === "--bb") {
      bb = parseEnteroPositivo(tomarValor(i + 1, "--bb"), "--bb");
      i++;
    } else if (arg.trim() === "") {
      // Ignora huecos accidentales.
    } else {
      throw new Error(`Flag desconocida: "${arg}". Usa --help para ver el uso.`);
    }
  }

  if (a.trim() === "") throw new Error('Valor inválido para --a: vacío. Usa --help para ver el uso.');
  if (b.trim() === "") throw new Error('Valor inválido para --b: vacío. Usa --help para ver el uso.');
  if (!help) {
    afirmarBaselineExiste(a, "--a");
    afirmarBaselineExiste(b, "--b");
  }
  return {
    a: a as BaselineId,
    b: b as BaselineId,
    hands,
    seed,
    stack,
    sb,
    bb,
    json,
    help,
  };
}

// ---------- Formato de tabla (tolerante a variantes del MatchResult) ----------

function comoRegistro(v: unknown): Record<string, unknown> {
  if (v !== null && typeof v === "object") return v as Record<string, unknown>;
  return {};
}

function comoNumero(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function primerNumero(...candidatos: unknown[]): number {
  for (const c of candidatos) {
    const n = comoNumero(c);
    if (n !== undefined) return n;
  }
  return 0;
}

function comoCi95(v: unknown): [number, number] | undefined {
  if (Array.isArray(v) && v.length >= 2) {
    const lo = v[0];
    const hi = v[1];
    if (typeof lo === "number" && typeof hi === "number") return [lo, hi];
  }
  return undefined;
}

function comoDist(v: unknown): Record<string, number> {
  const r = comoRegistro(v);
  const salida: Record<string, number> = {};
  for (const [k, val] of Object.entries(r)) {
    if (typeof val === "number" && Number.isFinite(val)) salida[k] = val;
  }
  return salida;
}

/** Normaliza una stat 0-1 (fracción) o 0-100 (porcentaje) a porcentaje 0-100. */
function aPorcentaje(v: unknown): number {
  const r = comoRegistro(v);
  // Por si la stat viniera anidada como { valor: 0.2 } (no esperado, pero tolerado).
  const n = primerNumero(v, r["valor"], r["pct"], r["porcentaje"]);
  if (n >= 0 && n <= 1) return n * 100;
  return n;
}

interface VistaStats {
  manos: number;
  vpip: number;
  pfr: number;
  threeBet: number;
  wtsd: number;
  wsd: number;
  aggro: number;
  showdown: number;
  dist: Record<string, number>;
}

function extraerStats(nodo: unknown, manosGlobal: number): VistaStats {
  const r = comoRegistro(nodo);
  return {
    manos: primerNumero(r["hands"], r["manos"], r["n"], manosGlobal),
    vpip: aPorcentaje(r["vpip"]),
    pfr: aPorcentaje(r["pfr"]),
    threeBet: aPorcentaje(
      r["threeBet"] ?? r["threebet"] ?? r["3b"] ?? r["3Bet"] ?? r["three_bet"],
    ),
    wtsd: aPorcentaje(r["wtsd"] ?? r["WTSD"]),
    wsd: aPorcentaje(r["wsd"] ?? r["wSd"] ?? r["WSD"] ?? r["w$sd"]),
    aggro: primerNumero(r["aggro"] ?? r["aggression"] ?? r["af"]),
    showdown: aPorcentaje(r["showdownRate"] ?? r["showdown"] ?? r["sdRate"]),
    dist: comoDist(r["actions"] ?? r["distAcciones"] ?? r["dist"] ?? r["acciones"] ?? r["actionDist"]),
  };
}

function conSigno(n: number, decimales: number): string {
  if (!Number.isFinite(n)) return "n/d";
  const base = n.toFixed(decimales);
  return n > 0 ? `+${base}` : base;
}

function formatearDist(dist: Record<string, number>): string {
  const claves = Object.keys(dist).sort();
  if (claves.length === 0) return "s/d";
  const total = claves.reduce((acc, k) => acc + (dist[k] ?? 0), 0);
  return claves
    .map((k) => {
      const v = dist[k] ?? 0;
      const p = total > 0 ? (v / total) * 100 : 0;
      return `${k}=${v} (${p.toFixed(1)}%)`;
    })
    .join("  ");
}

function filaStats(nombre: string, s: VistaStats): string {
  const celdas: string[] = [
    nombre.padEnd(12).slice(0, 12),
    String(s.manos).padStart(6),
    `${s.vpip.toFixed(1)}%`.padStart(7),
    `${s.pfr.toFixed(1)}%`.padStart(7),
    `${s.threeBet.toFixed(1)}%`.padStart(7),
    `${s.wtsd.toFixed(1)}%`.padStart(7),
    `${s.wsd.toFixed(1)}%`.padStart(7),
    s.aggro.toFixed(2).padStart(7),
    `${s.showdown.toFixed(1)}%`.padStart(9),
  ];
  return celdas.join(" ");
}

/**
 * Tabla legible del match. Es tolerante a variantes de campos del MatchResult
 * (bb100A/sdPorManoBB/ci95/statsA-B) para no acoplarse a un orden de campos.
 */
export function formatTable(result: ResultadoMatch, nameA: string, nameB: string): string {
  const r = comoRegistro(result);
  const regStatsA = comoRegistro(r["statsA"] ?? r["a"] ?? r["jugadorA"]);
  const manos = primerNumero(
    r["hands"],
    r["n"],
    r["manos"],
    r["totalHands"],
    regStatsA["hands"],
  );
  const semillaNum = comoNumero(r["seed"] ?? r["semilla"]);
  const semilla = semillaNum !== undefined ? String(semillaNum) : "n/d";
  const bb100 = primerNumero(r["bb100A"], r["bb100"], r["bb100a"], r["bbPor100"]);
  const sd = primerNumero(r["sdPorManoBB"], r["sd"], r["desviacion"], r["std"]);
  const ci = comoCi95(r["ci95"] ?? r["ci"] ?? r["ic95"]);
  const ciTexto = ci === undefined ? "s/d" : `[${conSigno(ci[0], 2)}, ${conSigno(ci[1], 2)}]`;

  const statsA = extraerStats(r["statsA"] ?? r["a"] ?? r["jugadorA"], manos);
  const statsB = extraerStats(r["statsB"] ?? r["b"] ?? r["jugadorB"], manos);

  const lineas: string[] = [
    `match ${nameA} vs ${nameB} · ${manos} manos · seed ${semilla}`,
    `bb/100 A (${nameA}): ${conSigno(bb100, 2)} · SD/mano: ${sd.toFixed(2)} bb · IC95%: ${ciTexto} (n=${manos})`,
    "",
    "agente       manos    VPIP     PFR      3B     WTSD     W$SD    aggro  showdown",
    filaStats(nameA, statsA),
    filaStats(nameB, statsB),
    "",
    `distribución ${nameA}: ${formatearDist(statsA.dist)}`,
    `distribución ${nameB}: ${formatearDist(statsB.dist)}`,
  ];
  return lineas.join("\n");
}

async function main(): Promise<void> {
  let opts: OpcionesEvaluate;
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
    console.log(`\nIds registrados: ${idsDisponibles().join(", ") || "s/d"}.`);
    return;
  }
  let agenteA: AgenteBaseline;
  let agenteB: AgenteBaseline;
  try {
    agenteA = obtenerBaseline(opts.a);
    agenteB = obtenerBaseline(opts.b);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
    return;
  }
  // Forma tolerante: incluye la forma del spec ({stacks, blinds}) y la plana
  // ({stack, sb, bb}); la implementación real usa la que necesite.
  const opciones = {
    hands: opts.hands,
    seed: opts.seed,
    stacks: opts.stack,
    blinds: { sb: opts.sb, bb: opts.bb },
    stack: opts.stack,
    sb: opts.sb,
    bb: opts.bb,
  } as unknown as OpcionesMatch;

  let resultado: ResultadoMatch;
  try {
    resultado = (await playMatch(agenteA, agenteB, opciones)) as ResultadoMatch;
  } catch (err) {
    console.error(`Fallo el match ${opts.a} vs ${opts.b}: ${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
    return;
  }
  if (opts.json) {
    console.log(JSON.stringify(resultado, null, 2));
    return;
  }
  const base = (resultado ?? {}) as unknown as Record<string, unknown>;
  const paraTabla = { hands: opts.hands, seed: opts.seed, ...base } as unknown as ResultadoMatch;
  const reg = paraTabla as unknown as Record<string, unknown>;
  if (reg["hands"] === undefined) reg["hands"] = opts.hands;
  if (reg["seed"] === undefined) reg["seed"] = opts.seed;
  console.log(formatTable(paraTabla, String(opts.a), String(opts.b)));
}

function esEjecucionDirecta(): boolean {
  const ejecutado: string = process.argv[1] ?? "";
  return ejecutado.endsWith("evaluate.ts") || ejecutado.endsWith("evaluate.js");
}

if (esEjecucionDirecta()) {
  void main();
}
