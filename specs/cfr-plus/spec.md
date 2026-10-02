# Spec P5 — CFR+ (Tammelin 2014)

## Objetivo

Convergencia más rápida que vanilla con el mismo cómputo. Gate de
honestidad: a igual nº de iteraciones y seed, `cfr+` debe medir
exploitability **menor o igual** que `cfr` en Kuhn y Leduc. Si no, no hay P5.

## Contratos

- `lib/cfr/plus.ts`: `applyRegretPlusUpdate(node, instant: number[]): void`
  (R ← max(R + r, 0) elemento a elemento, in-place) y `linearWeight(t) = t`.
- `trainer.ts`: `TrainOptions` añade `algorithm: "cfr" | "cfr+"`
  (defecto `"cfr"` para no romper llamadas existentes). `cfr+` =
  1. R+ (clamp tras cada update),
  2. averaging lineal (S += t·πi·σ con t = nº iteración empezando en 1),
  3. updates alternados (iteración impar actualiza regrets de P0, par de P1;
     la `strategySum` se acumula para AMBOS cada iteración con peso t).
  `strategyMap` no cambia (normaliza). `TrainResult` añade `algorithm`.
- `scripts/train.ts`: `--algorithm cfr|cfr+` (cfr+ deja de ser error).
- Checkpoints `checkpoints/kuhn-cfrplus-v1.json`, `leduc-cfrplus-v1.json`
  con `algorithm: "cfr+"`.

## Aceptación

- tsc 0 · tests: R+ trunca negativos y conserva positivos; con averaging
  lineal la media pondera más lo reciente; updates alternados (solo el
  jugador de turno acumula regret); **comparativa**: expl cfr+(N) ≤ expl
  cfr(N) misma seed en Kuhn (N=2000) y Leduc (N=1000); train CLI acepta cfr+.
- No se toca `lib/engine`, `lib/poker`, app, rooms ni baselines.
