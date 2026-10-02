# Spec P3 — Baselines + motor de evaluación

## Objetivo

Medir antes de entrenar. Sin línea base congelada ni IC95%, ningún "aprendizaje"
futuro será demostrable.

## Contratos

- `BaselineAgent { id, name, version, decide(info: InformationSet, rng): EngineAction }`
  en `lib/baselines/agent.ts`. Determinista dado rng; **prohibido `Math.random`**;
  decide SOLO desde `InformationSet` (no-leakage por construcción).
- 7 baselines: `random | calling-station | nit | tag | lag | maniac | gto-lite`.
  Versiones congeladas (`v0`): jamás cambiar su lógica, solo añadir nuevas
  versiones. `gto-lite` es heurística documentada, NO GTO.
- `best5(cards): HandRank` (mejor 5 de ≤7 vía `evaluate5`+`compareRanks`) para
  decisiones postflop de baselines. Límites documentados (sin draws/equity real).
- `playMatch(A, B, {hands, seed, stacks, blinds})`: heads-up con button
  alterno + asientos alternos (duplicado), sobre `lib/engine`.
- `MatchResult`: `bb100A`, `sdPorManoBB`, `ci95:[lo,hi]` (±1.96·SD/√n en
  bb/100), `statsA/B`: hands, vpip, pfr, threeBet, wtsd, wsd, aggro,
  showdownRate, distAcciones. Stats desde tokens de `history` (ciegas no
  están en history: todo `c/b/r/a` preflop es voluntario).
- `scripts/evaluate.ts`: `npm run evaluate -- --a tag --b random
  --hands 10000 --seed 7` → tabla + JSON. Añadir script `evaluate` a
  package.json (`tsx scripts/evaluate.ts`; tsx ya es devDep).

## Aceptación

- tsc 0 · tests: determinismo (misma seed→mismo resultado), legalidad
  (200 infosets aleatorios → acción siempre dentro de `expandActions`
  STANDARD), conservación en matches, alternancia de button, stats sanas
  (VPIP calling-station > nit con seed fija).
- Matriz inicial todos-contra-todos en `docs/benchmarks.md` con n, bb/100
  e IC95% reales (tamaño según velocidad medida; reportar el n usado).
- Nunca presentar winrate sin n. Prohibido "v2 mejor" sin significancia.
