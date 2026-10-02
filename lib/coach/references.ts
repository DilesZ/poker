// Referencias de juego tight (matriz propia, tag v0). Sin dependencias.
import type { PosLabel } from "./types";

export interface ReferenceRange {
  metric: string;
  pos?: PosLabel | "EP";
  low: number;
  high: number;
  source: string;
}

// Fuente literal exigida por el contrato del coach.
const FUENTE_TAG = "matriz baselines v0 (tag), n=5000, seed 7";

export const REFERENCES: ReferenceRange[] = [
  // VPIP global del tag en docs/benchmarks.md (~10%: rango 5%-15%).
  { metric: "vpip", low: 0.05, high: 0.15, source: FUENTE_TAG },
  // PFR global del tag (~3,1%: rango 1%-6%).
  { metric: "pfr", low: 0.01, high: 0.06, source: FUENTE_TAG },
  // VPIP en EP: proxy aproximado, NO medido por posición en la matriz.
  // La matriz solo da VPIP global; este rango es una aproximación documentada.
  {
    metric: "vpip",
    pos: "EP",
    low: 0.03,
    high: 0.12,
    source: `${FUENTE_TAG} — EP proxy aproximado, NO medido por posición`,
  },
  // Agresión postflop (b+r)/c: rango sano 1,0-3,0.
  // PROVISIONAL (auditoría F29): heurístico, NO medido en la matriz.
  { metric: "aggro_postflop", low: 1.0, high: 3.0, source: `${FUENTE_TAG} — heurístico provisional, NO medido en la matriz` },
  // Fold de BB ante open: rango 55%-85%.
  // PROVISIONAL (auditoría F29): heurístico, NO medido en la matriz.
  { metric: "fold_bb_vs_open", low: 0.55, high: 0.85, source: `${FUENTE_TAG} — heurístico provisional, NO medido en la matriz` },
  // F29 Kinds v2: definiciones operativas con umbrales convencionales (sin matriz salvo contexto).
  // OVERFOLD: fold postflop ante agresión >75% con n≥15.
  {
    metric: "overfold_postflop",
    low: 0,
    high: 0.75,
    source:
      "definición operativa F29, umbral convencional fold>75% postflop ante agresión, n≥15 (sin matriz: umbral convencional)",
  },
  // MISSED_VALUE: mano ≥trío (categoría ≥3) con showdown sin apuesta turn/river, n≥3 casos.
  {
    metric: "missed_value",
    low: 0,
    high: 3,
    source:
      "definición operativa F29, umbral convencional mano ≥trío (categoría ≥3 lib/poker/evaluator) sin apuesta en turn/river, n≥3 casos (sin matriz: umbral convencional)",
  },
  // BAD_SIZING: sizing <25% o >150% del bote en >40% de las apuestas, n≥15 (excluye allin).
  {
    metric: "bad_sizing",
    low: 0,
    high: 0.4,
    source:
      "definición operativa F29, umbral convencional sizing <25% o >150% bote en >40% apuestas, n≥15 (excluye allin; sizing=amount/(potAfter−amount))",
  },
  // BAD_PREFLOP: VPIP con tier 4-5 >40%, n≥15 manos tier 4-5.
  {
    metric: "bad_preflop",
    low: 0,
    high: 0.4,
    source:
      "definición operativa F29, umbral convencional VPIP>40% con tier 4-5, n≥15 manos tier 4-5 (tiers lib/baselines/strength)",
  },
  // OVERAGGRESSION: aggro >4.0 con bbWon total <0, n≥20.
  {
    metric: "overaggro",
    low: 1.0,
    high: 4.0,
    source:
      "definición operativa F29, umbral convencional aggro>4.0 con bbWon<0, n≥20 (aggro=(b+r)/c postflop; contexto matriz baselines v0 (tag), n=5000, seed 7)",
  },
];
