# Checkpoint F29 — 2026-10-03 — 5 errores detectables + auditoría

- 5 flags nuevos (OVERFOLD, MISSED_VALUE, BAD_SIZING, BAD_PREFLOP,
  OVERAGGRESSION) con n mínimos, evidencia y fuente; tiers/categorías de
  `lib/baselines/strength`.
- Auditoría honesta paralela: aggro/fold-BB reetiquetados como
  provisionales (no medidos); MISSED_VALUE tenía lookahead (juzgaba el
  turn con board final) → redefinido por calle (turn hole+4, river hole+5,
  sin agresión en ninguna); UNDERBLUFF/OVERBLUFF con modelo rival,
  TILT auto, RANGE_CONFLICT y STACK_MISMANAGEMENT quedan fuera
  documentados (sin datos de rival).
- Panel: mapa de lecciones para los 5 kinds.
- Gates: tsc 0 · **310/310** (51 archivos) · eslint limpio · build OK.
