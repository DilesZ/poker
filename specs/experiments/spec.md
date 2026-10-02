# Spec Experiments — F22 (experiment tracking)

## Objetivo

Cada experimento (train + eval) queda registrado, reproducible y comparable.
Nunca más "v2 es mejor" sin números lado a lado con significancia.

## Contratos

- `lib/experiments/types.ts`:
  `EvalEntry { opponent, hands, seed, bb100, ci95: [number,number],
  extra?: Record<string, number|string> }`,
  `Experiment { id, name, createdAt, algorithm: "cfr"|"cfr+",
  game: string, iterations: number, seed: number,
  populationTrainIds?: string[], abstraction?: string,
  checkpoint: { path, version, exploitability },
  curve: { iteration: number; exploitability: number }[],
  evaluations: EvalEntry[], notes?: string }`.
- `lib/experiments/store.ts`: `saveExperiment(dir, exp)` (no sobrescribe),
  `loadExperiment(path)`, `listExperiments(dir="experiments")`
  (salta inválidos, orden fecha desc),
  `compareExperiments(a, b): ComparedMetric[]` con
  `{ metric, a, b, delta, significant: boolean }` donde significant =
  CIs NO solapan (para bb100; para exploitability: diferencia relativa >
  10% con ambos > 0). Sin CIs → significant false + nota.
- `scripts/experiment.ts`: `npm run experiment -- --name exp-001 --game
  kuhn --algorithm cfr+ --iterations 10000 --seed 7 [--population @f]
  [--eval-baselines tag,nit --eval-hands 2000 --ckpt-out
  checkpoints/<name>.json] [--out experiments/<name>.json]`:
  1. entrena vía `quickTrain` de lib/lab/jobs (caps vigentes),
  2. guarda checkpoint en disco (saveCheckpoint; si existe → error),
  3. si game es holdem-hu-preflop y hay --eval-baselines: eval transferencia
     (loadCfrPreflopAgent + playMatch, fallback tag) por baseline,
  4. escribe `experiments/<name>.json` (crea dir). Exporta parseArgs.
  Añadir script `experiment` a package.json (tsx).
- `app/api/cfr/experiments/route.ts`: GET → `{ experiments }` (metas
  ligeras: sin curve; la curva se pide... incluye curve (son ≤20 puntos,
  barata) pero SIN nodos — el checkpoint referenciado los tiene).
- UI `components/lab/ExperimentsPanel.tsx`: tabla (id, juego, algoritmo,
  iters, expl, nº evals, fecha) + compare A-vs-B (dos selects):
  filas por métrica con delta y marca "significativo / no concluyente".
  Montar en LabSection tras ComparePanel. Sin dependencias.
- Solo se registran experimentos generados por el pipeline (no a mano).

## Aceptación

- tsc 0 · tests: roundtrip save/load, no-overwrite, compare con solape
  (significativo vs no), parseArgs, experimento kuhn 200 iters end-to-end
  (rápido) con 1 eval.
- Demo real: `exp-kuhn-cfrplus-10k` generado por el pipeline.
- Build OK.
