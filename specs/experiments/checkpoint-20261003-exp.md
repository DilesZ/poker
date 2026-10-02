# Checkpoint Experiments — 2026-10-03 — F22

- `lib/experiments/`: types + store (save/load/list/compare) + compare.ts
  puro (cliente-seguro; store lo reexporta).
- `scripts/experiment.ts` (+ script `experiment`): pipeline train →
  checkpoint → transfer eval → registro. Transfer solo en HU.
- `app/api/cfr/experiments` (+ detalle `[id]`) y `ExperimentsPanel`
  (tabla + compare A/B con significancia por solape IC).
- Colisión de agentes paralelos en mismos paths: sobrevivió una versión
  coherente (304/304 la confirman); `compareExperiments` devuelve fila
  informativa sin oponentes comunes + umbral 5%.
- Demos reales: `exp-kuhn-demo` (cfr+ 3k → expl 0.002) y `exp-hu-demo`
  (300 iters → expl 0.38; transfer tag −281 / station +71: muestra
  debilidad real de un agente poco entrenado, como exige F22).
- Gates: tsc 0 · **304/304** (51 archivos) · eslint limpio · build OK.
- Siguiente: F29 más errores, postflop/MCCFR, migración salas a engine.
