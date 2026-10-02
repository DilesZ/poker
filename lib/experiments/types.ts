// lib/experiments/types.ts
export interface EvalEntry { opponent: string; hands: number; seed: number; bb100: number; ci95: [number, number]; extra?: Record<string, number | string>; }
export interface ExperimentCheckpointRef { path: string; version: string; exploitability: number; }
export interface ExperimentCurvePoint { iteration: number; exploitability: number; }
export interface Experiment {
  id: string; name: string; createdAt: string;
  algorithm: "cfr" | "cfr+"; game: string; iterations: number; seed: number;
  populationTrainIds?: string[]; abstraction?: string;
  checkpoint: ExperimentCheckpointRef;
  curve: ExperimentCurvePoint[];
  evaluations: EvalEntry[];
  notes?: string;
}
