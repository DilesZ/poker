// lib/cfr/checkpoint.ts — Checkpoints versionados del entrenamiento CFR (P4).
// Guarda/carga JSON en checkpoints/. Jamás sobrescribe: si existe, lanza
// (hay que versionar el nombre del archivo).
import * as fs from "node:fs";
import * as ruta from "node:path";
import type { RegretNode } from "./node";

/** Checkpoint CFR serializable a JSON. */
export interface CfrCheckpoint {
  version: string;
  algorithm: "cfr";
  game: string;
  seed: number;
  iterations: number;
  nodes: Record<string, { actions: string[]; r: number[]; s: number[] }>;
  metrics: { exploitability: number };
  timestamp: string;
  configHash: string;
}

/** Extrae un vector numérico del nodo (r = regretSum, s = strategySum). */
function vectorDe(nodo: RegretNode, largo: "regretSum" | "strategySum", corto: "r" | "s"): number[] {
  const reg = nodo as unknown as Record<string, unknown>;
  const valor: unknown = reg[largo] ?? reg[corto];
  if (!Array.isArray(valor)) {
    return [];
  }
  return (valor as unknown[]).filter((x): x is number => typeof x === "number");
}

/**
 * Construye un checkpoint desde la tabla de nodos en memoria.
 * Copia los vectores para no aliasar el estado del entrenador.
 */
export function toCheckpoint(
  version: string,
  game: string,
  seed: number,
  iterations: number,
  nodes: Map<string, RegretNode>,
  expl: number,
  configHash: string,
): CfrCheckpoint {
  const registro: Record<string, { actions: string[]; r: number[]; s: number[] }> = {};
  for (const [clave, nodo] of nodes) {
    registro[clave] = {
      actions: [...nodo.actions],
      r: [...vectorDe(nodo, "regretSum", "r")],
      s: [...vectorDe(nodo, "strategySum", "s")],
    };
  }
  return {
    version,
    algorithm: "cfr",
    game,
    seed,
    iterations,
    nodes: registro,
    metrics: { exploitability: expl },
    timestamp: new Date().toISOString(),
    configHash,
  };
}

/**
 * Guarda el checkpoint como JSON con formato. Crea los directorios padre.
 * NO sobrescribe: si la ruta ya existe, lanza un Error.
 */
export function saveCheckpoint(path: string, cp: CfrCheckpoint): void {
  if (fs.existsSync(path)) {
    throw new Error(`El checkpoint ya existe y no se sobrescribe: "${path}". Versiona el nombre.`);
  }
  const dir = ruta.dirname(path);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path, JSON.stringify(cp, null, 2) + "\n", "utf8");
}

function esRegistro(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * Carga y valida mínimamente un checkpoint. Lanza Error en español si el
 * archivo no existe, no es JSON válido o no tiene la forma esperada.
 */
export function loadCheckpoint(path: string): CfrCheckpoint {
  let texto: string;
  try {
    texto = fs.readFileSync(path, "utf8");
  } catch {
    throw new Error(`No se pudo leer el checkpoint: "${path}".`);
  }
  let datos: unknown;
  try {
    datos = JSON.parse(texto) as unknown;
  } catch {
    throw new Error(`Checkpoint con JSON inválido: "${path}".`);
  }
  if (!esRegistro(datos)) {
    throw new Error(`Checkpoint inválido (no es un objeto): "${path}".`);
  }
  const metricas: unknown = datos["metrics"];
  const nodos: unknown = datos["nodes"];
  const valido =
    typeof datos["version"] === "string" &&
    datos["algorithm"] === "cfr" &&
    typeof datos["game"] === "string" &&
    typeof datos["seed"] === "number" &&
    typeof datos["iterations"] === "number" &&
    esRegistro(nodos) &&
    esRegistro(metricas) &&
    typeof metricas["exploitability"] === "number" &&
    typeof datos["timestamp"] === "string" &&
    typeof datos["configHash"] === "string";
  if (!valido) {
    throw new Error(`Checkpoint inválido (campos ausentes o algorithm ≠ "cfr"): "${path}".`);
  }
  // Todos los campos validados arriba: se reconstruye sin casts inseguros.
  const metricasReg = metricas as Record<string, unknown>;
  return {
    version: datos["version"] as string,
    algorithm: "cfr",
    game: datos["game"] as string,
    seed: datos["seed"] as number,
    iterations: datos["iterations"] as number,
    nodes: nodos as CfrCheckpoint["nodes"],
    metrics: { exploitability: metricasReg["exploitability"] as number },
    timestamp: datos["timestamp"] as string,
    configHash: datos["configHash"] as string,
  };
}
