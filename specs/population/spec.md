# Spec P6 — Population train≠eval

## Objetivo

Que el héroe no aprenda solo a derrotarse a sí mismo. Entrena contra una
mezcla configurable; evalúa contra otra disjunta. Si comparten miembros,
el CLI lo rechaza (no es un warning).

## Contratos

- `lib/cfr/population.ts`:
  `OppKind = "self" | "uniform" | "checkpoint"`;
  `PopulationMember { id, kind, weight, checkpointPath? }`;
  `PopulationConfig { members }`.
  `normalizePopulation` (pesos>0, suma>0, normaliza; si no, throw).
  `sampleMember(members, rng)` (ruleta por peso acumulado).
  `policyFor(member, nodes, loadCache)` → `(key, legal: string[]) => number[]`:
  self → regretMatching del nodo actual (uniforme si falta); uniform →
  uniforme; checkpoint → avg del JSON (cacheado; miss → uniforme).
  `validateDisjoint(train, eval_)`: throw si algún `id` aparece en ambas
  (incluye "self"/"uniform": si lo quieres en ambas, duplícalo con otro id).
- `trainer.ts`: `trainVsPopulation({game, iterations, seed, algorithm,
  population, heroSeats?: "alternate"|0|1 /*defecto alternate*/})`.
  Por iteración t: héroe = alternate ? t%2 : heroSeats; opp = sampleMember
  (rngPop = createRng(seed^0x9E37), independiente del juego); recorrido con
  héroe actualizando (regret+strategy según algoritmo) y opp FIJO sin
  updates (tampoco strategySum del opp). Retorna TrainResult +
  `opponentCounts: Record<id, number>`.
- `CfrCheckpoint` añade `population?: { train: string[]; eval: string[] }`
  (opcional; load tolera ausencia).
- `scripts/train.ts`: `--population <json|@fichero>` (config train) +
  `--eval-population <json|@fichero>` (opcional; si viene, se valida
  disjoint y sus ids van al checkpoint). Sin `--population`: camino actual
  intacto (self-play puro).

## Aceptación

- tsc 0 · tests: muestreo determinista y proporcional; uniform juega
  uniforme; checkpoint replays avg; héroe vs opp always-fold aprende a
  agredir (Kuhn: P0-bet sube); disjoint lanza ante solape y pasa ante
  configs disjuntas; trainVsPopulation determinista misma seed.
- `npm run train -- --game kuhn --iterations 2000 --population '{"members":[...]}'`
  funciona y deja checkpoint con population.train.
- No se toca lib/engine, lib/poker, app, rooms, baselines, eval.
