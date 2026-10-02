"use client";
// Sección interactiva del Laboratorio CFR (client component).
// Engloba el estado del último entrenamiento y compone los 5 paneles.
// Se importa desde app/entrenar/page.tsx (server component) sin tocar lo existente.

import { useState } from "react";
import TrainingForm, { type TrainResult } from "@/components/lab/TrainingForm";
import CurvesPanel from "@/components/lab/CurvesPanel";
import CheckpointsList from "@/components/lab/CheckpointsList";
import BenchmarkRunner from "@/components/lab/BenchmarkRunner";
import ComparePanel from "@/components/lab/ComparePanel";
import ExperimentsPanel from "@/components/lab/ExperimentsPanel";

export default function LabSection() {
  const [trainResult, setTrainResult] = useState<TrainResult | null>(null);

  return (
    <div className="lab-wrap" aria-label="Laboratorio CFR">
      <section className="train-panel" aria-label="Laboratorio CFR — entrenamiento">
        <h2>🧪 Laboratorio CFR</h2>
        <p className="poker-muted">
          Entrena CFR/CFR+ en Kuhn, Leduc o HU-preflop y visualiza la curva de
          exploitabilidad. Los checkpoints y benchmarks usan las APIs{" "}
          <code>/api/cfr/checkpoints</code>, <code>/api/cfr/train</code> y{" "}
          <code>/api/cfr/evaluate</code>.
        </p>
        <div className="lab-grid">
          <TrainingForm onResult={setTrainResult} />
          <CurvesPanel
            curve={trainResult?.curve ?? []}
            finalExploitability={
              typeof trainResult?.finalExploitability === "number"
                ? trainResult.finalExploitability
                : null
            }
          />
        </div>
      </section>
      <CheckpointsList />
      <BenchmarkRunner />
      <ComparePanel />
      <ExperimentsPanel />
    </div>
  );
}
