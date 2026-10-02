# Spec Lab — `/entrenar` como laboratorio (P7 parcial)

## Objetivo

Operar el laboratorio desde la app: entrenar (acotado), ver curvas,
listar checkpoints, lanzar benchmarks y comparar agentes. Sin romper lo
existente (`SelfPlayPanel`, `TournamentBar`, panel honesto se quedan).

## Contratos

- `lib/lab/jobs.ts`:
  `QuickTrainRequest { game:"kuhn"|"leduc"|"holdem-hu-preflop",
  algorithm:"cfr"|"cfr+", iterations, seed, population? }`,
  `CurvePoint { iteration, exploitability }`,
  `QuickTrainResult { game, algorithm, iterations, seed, curve,
  finalExploitability, checkpoint: CfrCheckpoint, elapsedMs }`,
  `TRAIN_CAPS = { kuhn:50000, leduc:5000, holdem-hu-preflop:500 }`
  (límite serverless; exceder → throw). Curva: 20 puntos (cada
  max(1,floor(n/20))). HU carga EV table (si falta → throw "npm run
  compute-ev"). `listCheckpoints(dir="checkpoints"): CheckpointMeta[]`
  `{file,version,algorithm,game,seed,iterations,exploitability,timestamp}`
  ordenados por fecha desc; ficheros inválidos se saltan (no rompen).
- `lib/lab/benchmark.ts`:
  `LabSide = {kind:"baseline",id} | {kind:"ckpt",path}`,
  `LabBenchmarkRequest { a:LabSide, b:LabSide, hands, seed, fallback? }`,
  `BENCH_CAPS = { maxHands: 2000 }` (exceder → throw).
  `runLabBenchmark(req): { result: MatchResult, missesA, missesB,
  fallbacksA, fallbacksB }` (baselines de BASELINES; ckpt vía
  loadCfrPreflopAgent; fallback por defecto tag).
- API (todas `force-dynamic`):
  `GET /api/cfr/checkpoints` → `{checkpoints}`,
  `POST /api/cfr/train` (body QuickTrainRequest) → QuickTrainResult
  (NO guarda en disco en servidor: devuelve el checkpoint en la respuesta),
  `POST /api/cfr/evaluate` (body LabBenchmarkRequest) → tabla + resultado.
  Errores de validación → 400 con mensaje en español.
- UI `/entrenar` (añade secciones, no sustituye): TrainingForm
  (algorithm, juego, iteraciones con tope visible, seed, population
  opcional como JSON), CurvesPanel (SVG sin dependencias: expl vs
  iteración, log-x), CheckpointsList (tabla desde API), BenchmarkRunner
  (selectores baseline/ckpt + hands con tope + tabla resultado),
  ComparePanel (ckpt A vs ckpt B HU-preflop + baseline de referencia).
  Polling/fetch simple, estados carga/error, en español.

## Aceptación

- tsc 0 · tests: caps (exceder lanza), curva con 20 puntos monótona en
  estructura (no en valores), listCheckpoints con dir temporal,
  benchmark 20 manos baseline-vs-baseline y ckpt-sintético-vs-baseline,
  parse/format del CLI intactos.
- Entrenamientos largos siguen siendo `npm run train` (el lab es para
  explorar y verificar, no para producción de checkpoints).
- Build OK (nuevas rutas en el mapa).
