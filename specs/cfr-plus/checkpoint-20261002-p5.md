# Checkpoint P5 — 2026-10-02 — CFR+

- `lib/cfr/plus.ts`: R+ (`R ← max(R+r, 0)` in-place) + `linearWeight(t)=t`.
- `trainer.ts`: `algorithm: "cfr"|"cfr+"` (defecto cfr); cfr+ = R+ +
  averaging lineal (S += t·π·σ ambos jugadores) + updates alternados
  (impar P0, par P1). `strategyMap` intacto.
- `scripts/train.ts`: `--algorithm cfr|cfr+` + pasa algorithm al checkpoint.
- `checkpoint.ts`: `algorithm: "cfr"|"cfr+"` en tipo, construcción y
  validación de carga (antes hardcodeado a "cfr").

## Validación comparativa (misma seed)

- Kuhn N=2000: cfr 0.0045 vs **cfr+ 0.0026** ✓
- Leduc N=800: cfr 0.063 vs **cfr+ 0.041** ✓
- Reales: kuhn-cfrplus 20k → **0.0008**; leduc-cfrplus 3k → **0.023**.

## Gates

- tsc 0 · **239/239** (38 archivos; 8 tests P5 nuevos) · eslint limpio ·
  build OK.
- Siguiente: P6 population (train≠eval) o aplicar CFR+ a Hold'em HU con
  abstracción P2 (decidir orden con usuario; P5 no lo exige).
