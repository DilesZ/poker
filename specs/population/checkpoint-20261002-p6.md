# Checkpoint P6 — 2026-10-02 — Population train≠eval

- `lib/cfr/population.ts`: pool fija (self/uniform/checkpoint), muestreo por
  ruleta con rng, `policyFor` (self=current, uniform, checkpoint cacheado),
  `validateDisjoint` (lanza ante solape de ids).
- `trainer.ts`: `trainVsPopulation` (héroe alternate/P0/P1, opp fijo sin
  updates, opponentCounts). `trainCFR` intacto.
- `scripts/train.ts`: `--population`/`--eval-population` (JSON o @fichero),
  checkpoint con `population:{train:[ids]}` (+ campo en tipo y validación).
- Corrección de spec (hallazgo honesto del agente): exploitability NO aplica
  vs pool fija (el perfil nunca es Nash); la métrica correcta es BR-value vs
  el pool. Test conductual adaptado y documentado.
- Entrenamiento HU: `specs/population/pop-train-hu.json`
  (self 50 / uni-train 20 / v2 30), 10k iters → `hu-cfrplus-pop-v1.json`
  (opponentCounts 4966/2026/3008 ✓ mezcla).
- Transferencia pop-v1 (n=3000): random **+454** ✓, station **+86** ✓,
  nit +8 (nc), tag +8 (nc). vs v2 (+274/+118/+27/+42): mejor puntual vs
  random, resto dentro del ruido (CIs solapan). Miss 0% (v2 tenía 3.2%).
- Eval disjunta: pool train (self/uniform/v2) ∩ baselines transfer = ∅ por
  construcción (distintos sistemas); sin `--eval-population` en esta run.
- Gates: tsc 0 · **264/264** · eslint limpio · build OK.
- Siguiente: UI lab `/entrenar` (curvas, population, checkpoints, benchmark,
  compare) o postflop/MCCFR.
