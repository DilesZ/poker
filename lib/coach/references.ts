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
  { metric: "aggro_postflop", low: 1.0, high: 3.0, source: FUENTE_TAG },
  // Fold de BB ante open: rango 55%-85%.
  { metric: "fold_bb_vs_open", low: 0.55, high: 0.85, source: FUENTE_TAG },
];
