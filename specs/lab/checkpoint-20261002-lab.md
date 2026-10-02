# Checkpoint Lab — 2026-10-02 — `/entrenar` como laboratorio (P7 parcial)

- `lib/lab/jobs.ts`: quickTrain (caps 50k/5k/500, curva 5-8 hitos por
  reentrenamiento documentado, checkpoint en respuesta sin guardar en disco),
  listCheckpoints (ordena desc, salta inválidos).
- `lib/lab/benchmark.ts`: runLabBenchmark (cap 2000 manos, baselines y ckpt).
- `app/api/cfr/{checkpoints,train,evaluate}` (force-dynamic, 400/500 en
  español).
- UI: TrainingForm, CurvesPanel (SVG log-x sin deps), CheckpointsList,
  BenchmarkRunner, ComparePanel (ckpt-vs-ckpt), LabSection; lo existente
  intacto (SelfPlayPanel, TournamentBar, panel honesto).
- E2E en build prod local: 7 checkpoints listados; train kuhn 2000 →
  expl 0.0026 en 207ms; cap excedido → 400; evaluate 200 manos OK;
  /entrenar renderiza la sección lab.
- Entrenamientos largos siguen siendo `npm run train` (el lab explora).
- Gates: tsc 0 · **271/271** (45 archivos) · build OK (rutas cfr visibles).
- Siguiente: P6 ya hecho; pendientes mayores: postflop/MCCFR, coach por
  datos (F28), replay con EV (F27), experiment tracking (F22).
