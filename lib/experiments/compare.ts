// lib/experiments/compare.ts — Comparación pura entre experimentos (español).
// SIN node:fs ni dependencias: importable desde componentes cliente.
// La REFERENCIA canónica es esta función; la UI la usa directamente.
// Lógica (15 líneas efectivas): solape de IC para bb/100 + diferencia
// relativa para exploitabilidad. delta = b - a en todas las métricas.

import type { EvalEntry, Experiment } from "./types";

/** Una fila de la comparativa A vs B. */
export interface ComparedMetric {
  metric: string;
  a: number;
  b: number;
  delta: number;
  significant: boolean;
  note?: string;
}

/** Umbral de diferencia relativa para exploitabilidad (5 %). */
const UMBRAL_REL_EXPL = 0.05;

/** ¿No se solapan los IC95%? Entonces la diferencia es significativa. */
function icsNoSolapan(a: EvalEntry, b: EvalEntry): boolean {
  const [aLo, aHi] = a.ci95;
  const [bLo, bHi] = b.ci95;
  return aHi < bLo || bHi < aLo;
}

/**
 * Compara dos experimentos métrica a métrica.
 * - `exploitability`: delta absoluto; significativo si la diferencia
 *   relativa supera el 5 % (menor es mejor).
 * - `bb100 vs <oponente>` (solo oponentes comunes): delta absoluto;
 *   significativo si los IC95% no se solapan.
 */
export function compareExperiments(a: Experiment, b: Experiment): ComparedMetric[] {
  const filas: ComparedMetric[] = [];
  const explA = a.checkpoint.exploitability;
  const explB = b.checkpoint.exploitability;
  const deltaExpl = explB - explA;
  const base = Math.max(Math.abs(explA), 1e-12);
  filas.push({
    metric: "exploitability",
    a: explA,
    b: explB,
    delta: deltaExpl,
    significant: Math.abs(deltaExpl) / base > UMBRAL_REL_EXPL,
    note: "Menor es mejor; significativa si la diferencia relativa supera el 5 %.",
  });
  const porOponenteB = new Map<string, EvalEntry>();
  for (const e of b.evaluations) {
    if (!porOponenteB.has(e.opponent)) porOponenteB.set(e.opponent, e);
  }
  let comunes = 0;
  for (const ea of a.evaluations) {
    const eb = porOponenteB.get(ea.opponent);
    if (!eb) continue;
    comunes++;
    filas.push({
      metric: `bb100 vs ${ea.opponent}`,
      a: ea.bb100,
      b: eb.bb100,
      delta: eb.bb100 - ea.bb100,
      significant: icsNoSolapan(ea, eb),
      note: `IC95% A [${ea.ci95[0].toFixed(2)}, ${ea.ci95[1].toFixed(2)}] vs B [${eb.ci95[0].toFixed(2)}, ${eb.ci95[1].toFixed(2)}]; significativa si no se solapan.`,
    });
  }
  if (comunes === 0) {
    filas.push({
      metric: "evaluaciones comunes",
      a: a.evaluations.length,
      b: b.evaluations.length,
      delta: b.evaluations.length - a.evaluations.length,
      significant: false,
      note: "Sin oponentes comunes: no hay bb/100 comparable.",
    });
  }
  return filas;
}
