// lib/lab/benchmark.ts — Duelos del laboratorio entre baselines y checkpoints.
// Cero dependencias salvo los contratos indicados. Sin Math.random.
// Español. TypeScript estricto.
import { playMatch, type MatchResult } from "@/lib/eval/match";
import { BASELINES, type BaselineAgent, type BaselineId } from "@/lib/baselines/agent";
import { loadCfrPreflopAgent, type CfrPreflopAgent } from "@/lib/cfr/agent";

/** Un bando del duelo: baseline del registro o checkpoint CFR en disco. */
export type LabSide = { kind: "baseline"; id: string } | { kind: "ckpt"; path: string };

/** Petición de benchmark del laboratorio. */
export interface LabBenchmarkRequest {
  a: LabSide;
  b: LabSide;
  hands: number;
  seed: number;
  fallback?: BaselineId;
}

/** Topes del benchmark (protegen el presupuesto serverless). */
export const BENCH_CAPS = { maxHands: 2000 };

/** Resultado del duelo con los contadores de respaldo de cada lado. */
export interface LabBenchmarkResult {
  result: MatchResult;
  missesA: number;
  missesB: number;
  fallbacksA: number;
  fallbacksB: number;
}

/** Comprueba que el id pertenece al registro de baselines. */
function esBaselineId(id: string): id is BaselineId {
  return Object.prototype.hasOwnProperty.call(BASELINES, id);
}

/** Resuelve un bando a un agente jugable (el fallback solo aplica a ckpt). */
function resolverAgente(lado: LabSide, fallback: BaselineId): BaselineAgent {
  if (lado.kind === "baseline") {
    if (!esBaselineId(lado.id)) {
      const disp = Object.keys(BASELINES).join(", ");
      throw new Error(`Baseline desconocida: "${lado.id}". Disponibles: ${disp}.`);
    }
    return BASELINES[lado.id];
  }
  if (lado.kind === "ckpt") {
    if (typeof lado.path !== "string" || lado.path.length === 0) {
      throw new Error("El bando ckpt exige un path no vacío.");
    }
    return loadCfrPreflopAgent(lado.path, fallback);
  }
  throw new Error(`Bando desconocido (kind ∉ {baseline, ckpt}): "${String((lado as LabSide).kind)}".`);
}

/** Misses del agente (0 para baselines). */
function missesDe(agente: BaselineAgent): number {
  const conContadores = agente as Partial<CfrPreflopAgent>;
  if (typeof conContadores.misses === "function") {
    try {
      return conContadores.misses();
    } catch {
      return 0;
    }
  }
  return 0;
}

/** Fallbacks postflop del agente (0 para baselines). */
function fallbacksDe(agente: BaselineAgent): number {
  const conContadores = agente as Partial<CfrPreflopAgent>;
  if (typeof conContadores.fallbacksPostflop === "function") {
    try {
      return conContadores.fallbacksPostflop();
    } catch {
      return 0;
    }
  }
  return 0;
}

/**
 * Juega un duelo heads-up entre los bandos indicados.
 * - Valida hands entero 1..2000 y seed entero >= 0.
 * - Las baselines deben existir en BASELINES; los ckpt se cargan con
 *   loadCfrPreflopAgent (fallback por defecto "tag").
 * - Los contadores misses/fallbacks se leen del agente CFR (0 en baselines).
 */
export function runLabBenchmark(req: LabBenchmarkRequest): LabBenchmarkResult {
  const hands = req.hands;
  if (!Number.isInteger(hands) || hands < 1 || hands > BENCH_CAPS.maxHands) {
    throw new RangeError(
      `hands debe ser un entero 1..${BENCH_CAPS.maxHands} (recibido: ${String(hands)}).`,
    );
  }
  if (!Number.isInteger(req.seed) || req.seed < 0) {
    throw new RangeError(`seed debe ser un entero >= 0 (recibido: ${String(req.seed)}).`);
  }
  const fallback: BaselineId = req.fallback ?? "tag";
  if (!esBaselineId(fallback)) {
    const disp = Object.keys(BASELINES).join(", ");
    throw new Error(`Fallback desconocido: "${fallback}". Disponibles: ${disp}.`);
  }
  const agenteA = resolverAgente(req.a, fallback);
  const agenteB = resolverAgente(req.b, fallback);
  const result = playMatch(agenteA, agenteB, { hands, seed: req.seed });
  return {
    result,
    missesA: missesDe(agenteA),
    missesB: missesDe(agenteB),
    fallbacksA: fallbacksDe(agenteA),
    fallbacksB: fallbacksDe(agenteB),
  };
}
