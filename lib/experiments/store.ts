// lib/experiments/store.ts
//
// Persistencia en disco y comparación de experimentos de entrenamiento.
// Cero dependencias: solo `node:fs` y `node:path`. Todos los errores, en español.
//
// Decisión documentada para `compareExperiments`: la comparación exige al menos
// un oponente común en `evaluations`. Sin oponentes comunes se devuelve un array
// vacío (sin filas informativas) y el llamador (CLI/UI) muestra el aviso. Motivo:
// sin una base común de evaluación, cualquier delta —incluido el de
// exploitability, sensible a juego o abstracción distintos— induce a error.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { EvalEntry, Experiment, ExperimentCurvePoint } from "./types";

/** Una métrica comparada entre dos experimentos. `delta` es `b - a`. */
export interface ComparedMetric {
  metric: string;
  a: number;
  b: number;
  delta: number;
  significant: boolean;
  note?: string;
}

/** Diferencia relativa mínima para considerar significativo un cambio de exploitability. */
const UMBRAL_DIF_RELATIVA_EXPLOTABILIDAD = 0.1;

type Registro = Record<string, unknown>;

function esRegistro(valor: unknown): valor is Registro {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function esTextoNoVacio(valor: unknown): valor is string {
  return typeof valor === "string" && valor.trim().length > 0;
}

function esNumeroFinito(valor: unknown): valor is number {
  return typeof valor === "number" && Number.isFinite(valor);
}

function esAlgoritmo(valor: unknown): valor is Experiment["algorithm"] {
  return valor === "cfr" || valor === "cfr+";
}

function invalido(detalle: string): Error {
  return new Error(`experimento no válido: ${detalle}`);
}

function validarPuntoCurva(valor: unknown): ExperimentCurvePoint {
  if (!esRegistro(valor)) {
    throw invalido("«curve» debe ser una lista de puntos { iteration, exploitability }.");
  }
  const iteration = valor["iteration"];
  const exploitability = valor["exploitability"];
  if (!esNumeroFinito(iteration)) {
    throw invalido("«curve[].iteration» debe ser un número finito.");
  }
  if (!esNumeroFinito(exploitability)) {
    throw invalido("«curve[].exploitability» debe ser un número finito.");
  }
  return { iteration, exploitability };
}

function validarEvaluacion(valor: unknown): EvalEntry {
  if (!esRegistro(valor)) {
    throw invalido("«evaluations» debe ser una lista de objetos { opponent, hands, seed, bb100, ci95 }.");
  }
  const opponent = valor["opponent"];
  const hands = valor["hands"];
  const seed = valor["seed"];
  const bb100 = valor["bb100"];
  const ci95 = valor["ci95"];
  if (!esTextoNoVacio(opponent)) {
    throw invalido("«evaluations[].opponent» debe ser un texto no vacío.");
  }
  if (!esNumeroFinito(hands)) {
    throw invalido("«evaluations[].hands» debe ser un número finito.");
  }
  if (!esNumeroFinito(seed)) {
    throw invalido("«evaluations[].seed» debe ser un número finito.");
  }
  if (!esNumeroFinito(bb100)) {
    throw invalido("«evaluations[].bb100» debe ser un número finito.");
  }
  if (!Array.isArray(ci95) || ci95.length !== 2) {
    throw invalido("«evaluations[].ci95» debe ser una tupla [número, número].");
  }
  const [limiteBajo, limiteAlto] = ci95;
  if (!esNumeroFinito(limiteBajo) || !esNumeroFinito(limiteAlto)) {
    throw invalido("«evaluations[].ci95» debe ser una tupla [número, número].");
  }
  const entrada: EvalEntry = {
    opponent,
    hands,
    seed,
    bb100,
    ci95: [limiteBajo, limiteAlto],
  };
  const extraCrudo = valor["extra"];
  if (extraCrudo !== undefined) {
    if (!esRegistro(extraCrudo)) {
      throw invalido("«evaluations[].extra» debe ser un objeto { clave: número | texto }.");
    }
    const extra: Record<string, number | string> = {};
    for (const [clave, contenido] of Object.entries(extraCrudo)) {
      if (typeof contenido === "string") {
        extra[clave] = contenido;
      } else if (esNumeroFinito(contenido)) {
        extra[clave] = contenido;
      } else {
        throw invalido(`«evaluations[].extra.${clave}» debe ser un número finito o un texto.`);
      }
    }
    entrada.extra = extra;
  }
  return entrada;
}

function validarExperimento(valor: unknown): Experiment {
  if (!esRegistro(valor)) {
    throw invalido("debe ser un objeto JSON.");
  }
  const id = valor["id"];
  const name = valor["name"];
  const createdAt = valor["createdAt"];
  const algorithm = valor["algorithm"];
  const game = valor["game"];
  const iterations = valor["iterations"];
  const seed = valor["seed"];
  if (!esTextoNoVacio(id)) {
    throw invalido("«id» debe ser un texto no vacío.");
  }
  if (!esTextoNoVacio(name)) {
    throw invalido("«name» debe ser un texto no vacío.");
  }
  if (typeof createdAt !== "string" || createdAt.length === 0 || Number.isNaN(Date.parse(createdAt))) {
    throw invalido("«createdAt» debe ser un texto no vacío con una fecha válida (ISO).");
  }
  if (!esAlgoritmo(algorithm)) {
    throw invalido("«algorithm» debe ser «cfr» o «cfr+».");
  }
  if (!esTextoNoVacio(game)) {
    throw invalido("«game» debe ser un texto no vacío.");
  }
  if (!esNumeroFinito(iterations) || iterations <= 0) {
    throw invalido("«iterations» debe ser un número mayor que 0.");
  }
  if (!esNumeroFinito(seed)) {
    throw invalido("«seed» debe ser un número finito.");
  }
  const checkpointCrudo = valor["checkpoint"];
  if (!esRegistro(checkpointCrudo)) {
    throw invalido("«checkpoint» debe ser un objeto { path, version, exploitability }.");
  }
  const rutaCheckpoint = checkpointCrudo["path"];
  const versionCheckpoint = checkpointCrudo["version"];
  const exploitabilityCheckpoint = checkpointCrudo["exploitability"];
  if (!esTextoNoVacio(rutaCheckpoint)) {
    throw invalido("«checkpoint.path» debe ser un texto no vacío.");
  }
  if (typeof versionCheckpoint !== "string") {
    throw invalido("«checkpoint.version» debe ser un texto.");
  }
  if (!esNumeroFinito(exploitabilityCheckpoint)) {
    throw invalido("«checkpoint.exploitability» debe ser un número finito.");
  }
  if (!Array.isArray(valor["curve"])) {
    throw invalido("«curve» debe ser una lista de puntos.");
  }
  if (!Array.isArray(valor["evaluations"])) {
    throw invalido("«evaluations» debe ser una lista de evaluaciones.");
  }
  const exp: Experiment = {
    id,
    name,
    createdAt,
    algorithm,
    game,
    iterations,
    seed,
    checkpoint: {
      path: rutaCheckpoint,
      version: versionCheckpoint,
      exploitability: exploitabilityCheckpoint,
    },
    curve: valor["curve"].map(validarPuntoCurva),
    evaluations: valor["evaluations"].map(validarEvaluacion),
  };
  const idsCrudos = valor["populationTrainIds"];
  if (idsCrudos !== undefined) {
    if (!Array.isArray(idsCrudos)) {
      throw invalido("«populationTrainIds» debe ser una lista de textos.");
    }
    const ids: string[] = [];
    for (const candidato of idsCrudos) {
      if (typeof candidato !== "string") {
        throw invalido("«populationTrainIds» debe ser una lista de textos.");
      }
      ids.push(candidato);
    }
    exp.populationTrainIds = ids;
  }
  const abstraccion = valor["abstraction"];
  if (abstraccion !== undefined) {
    if (typeof abstraccion !== "string") {
      throw invalido("«abstraction» debe ser un texto.");
    }
    exp.abstraction = abstraccion;
  }
  const notas = valor["notes"];
  if (notas !== undefined) {
    if (typeof notas !== "string") {
      throw invalido("«notes» debe ser un texto.");
    }
    exp.notes = notas;
  }
  return exp;
}

function validarIdParaArchivo(id: string): void {
  if (id === "." || id === ".." || id.includes("/") || id.includes("\\")) {
    throw new Error(`el «id» ${JSON.stringify(id)} no es válido como nombre de archivo (no debe contener rutas).`);
  }
}

/**
 * Guarda un experimento como `<dir>/<id>.json` (bonito, con salto final).
 * Crea el directorio si falta. Si el archivo ya existe, lanza y no sobrescribe.
 * Devuelve la ruta del archivo escrito.
 */
export function saveExperiment(dir: string, exp: Experiment): string {
  const valido = validarExperimento(exp);
  validarIdParaArchivo(valido.id);
  mkdirSync(dir, { recursive: true });
  const ruta = join(dir, `${valido.id}.json`);
  if (existsSync(ruta)) {
    throw new Error(`ya existe un experimento con id «${valido.id}» en «${dir}»: no se sobrescribe.`);
  }
  writeFileSync(ruta, `${JSON.stringify(valido, null, 2)}\n`, "utf8");
  return ruta;
}

/** Carga y valida un experimento desde su archivo JSON. Errores en español. */
export function loadExperiment(ruta: string): Experiment {
  let texto: string;
  try {
    texto = readFileSync(ruta, "utf8");
  } catch {
    throw new Error(`no se puede leer el experimento en «${ruta}»: el archivo no existe o no es legible.`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(texto) as unknown;
  } catch {
    throw new Error(`el archivo «${ruta}» no contiene JSON válido.`);
  }
  try {
    return validarExperimento(parsed);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`el archivo «${ruta}» no contiene un experimento válido: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Lista los experimentos (`*.json`) de un directorio, ordenados por
 * `createdAt` descendente. Salta archivos rotos o con forma inválida.
 * Un directorio inexistente (o ilegible) devuelve `[]`.
 */
export function listExperiments(dir = "experiments"): Experiment[] {
  let nombres: string[];
  try {
    nombres = readdirSync(dir);
  } catch {
    return [];
  }
  const salida: Experiment[] = [];
  for (const nombre of nombres) {
    if (!nombre.endsWith(".json")) {
      continue;
    }
    try {
      salida.push(loadExperiment(join(dir, nombre)));
    } catch {
      // Salta JSON roto o con forma inválida sin abortar el listado.
      continue;
    }
  }
  salida.sort((a, b) => {
    if (a.createdAt === b.createdAt) {
      if (a.id === b.id) {
        return 0;
      }
      return a.id < b.id ? -1 : 1;
    }
    return a.createdAt < b.createdAt ? 1 : -1;
  });
  return salida;
}

function compararExploitability(xa: number, xb: number): ComparedMetric {
  const delta = xb - xa;
  if (xa > 0 && xb > 0) {
    const difRelativa = Math.abs(xa - xb) / Math.max(xa, xb);
    return {
      metric: "exploitability",
      a: xa,
      b: xb,
      delta,
      significant: difRelativa > UMBRAL_DIF_RELATIVA_EXPLOTABILIDAD,
    };
  }
  return {
    metric: "exploitability",
    a: xa,
    b: xb,
    delta,
    significant: xa !== xb,
    note: "comparar con 0 es degenerado",
  };
}

function leerIntervalo(valor: unknown): readonly [number, number] | null {
  if (!Array.isArray(valor) || valor.length !== 2) {
    return null;
  }
  const [bajo, alto] = valor;
  if (!esNumeroFinito(bajo) || !esNumeroFinito(alto)) {
    return null;
  }
  return [Math.min(bajo, alto), Math.max(bajo, alto)];
}

function compararBb100(ea: EvalEntry, eb: EvalEntry): ComparedMetric {
  const fila: ComparedMetric = {
    metric: `bb100 vs ${ea.opponent}`,
    a: ea.bb100,
    b: eb.bb100,
    delta: eb.bb100 - ea.bb100,
    significant: false,
  };
  const intervaloA = leerIntervalo(ea.ci95);
  const intervaloB = leerIntervalo(eb.ci95);
  if (intervaloA === null || intervaloB === null) {
    fila.note = "falta el IC95 en alguna evaluación; la significancia no es evaluable";
    return fila;
  }
  // Intervalos cerrados: tocarse en un extremo cuenta como solape.
  const solapan = Math.max(intervaloA[0], intervaloB[0]) <= Math.min(intervaloA[1], intervaloB[1]);
  fila.significant = !solapan;
  return fila;
}

/**
 * Compara dos experimentos. Exige al menos un oponente común en `evaluations`:
 * sin oponentes comunes devuelve `[]` (ver decisión en la cabecera) y el
 * llamador muestra el aviso. Con base común, devuelve la fila `exploitability`
 * (significativa si la diferencia relativa supera el 10 % con ambos > 0) más
 * una fila `bb100 vs <oponente>` por cada oponente común (significativa si los
 * IC95 no solapan; si falta algún IC, no significativa con nota).
 */
export function compareExperiments(a: Experiment, b: Experiment): ComparedMetric[] {
  const porOponente = new Map<string, EvalEntry>();
  for (const entrada of a.evaluations) {
    if (!porOponente.has(entrada.opponent)) {
      porOponente.set(entrada.opponent, entrada);
    }
  }
  const comunes: Array<{ ea: EvalEntry; eb: EvalEntry }> = [];
  const vistos = new Set<string>();
  for (const eb of b.evaluations) {
    const ea = porOponente.get(eb.opponent);
    if (ea !== undefined && !vistos.has(eb.opponent)) {
      vistos.add(eb.opponent);
      comunes.push({ ea, eb });
    }
  }
  if (comunes.length === 0) {
    return [];
  }
  const filas: ComparedMetric[] = [
    compararExploitability(a.checkpoint.exploitability, b.checkpoint.exploitability),
  ];
  for (const { ea, eb } of comunes) {
    filas.push(compararBb100(ea, eb));
  }
  return filas;
}
