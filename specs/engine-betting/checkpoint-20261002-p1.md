# Checkpoint P0+P1 — 2026-10-02 — Auditoría + motor canónico

## P0 Auditoría (plan-mode, solo lectura)

4 agentes en paralelo + verificación propia + literatura (Zinkevich 2007,
Tammelin 2014, Lanctot 2009, Brown et al. 2019, OpenSpiel).
Hallazgos firmados en `docs/AI_ROADMAP.md`:
- Tres "aprendizajes" inconexos, ninguno CFR; "Aplicar a IA mesa" sin efecto
  (store jamás importa loadStrategy).
- `lib/poker/game.ts` sin máquina de apuestas; apuestas duplicadas en
  store vs roomEngine; HU roto; sin refund; odd-chip mal asignado.
- Gaps: infosets, abstracción, baselines, equity, rangos, populations,
  checkpoints con hash, experimentos, train/evaluate, workers, curvas,
  replay EV, no-leakage, property-based (grep: 0 resultados).

## P1 Motor `lib/engine/` (build-mode)

- `types.ts` (PokerState inmutable, invariante `pot==ΣbetHand`),
  `rng.ts` (createRng/mulberry32), `state.ts` (blinds HU-aware, orden),
  `betting.ts` (applyAction inmutable, LegalActions, min-raise, short-raise),
  `settle.ts` (pots+refund, showdown, odd-chip izquierda-button).
- Unificación contable: settle pasó al modelo de bote único de betting
  (verifyConservation = Σstack+pot; test 6 reescrito con odd-chip real 123/2;
  test 7 corregido a 950/2850).
- Fix colateral: `vitest.config.ts` resuelve alias `@` (vite no leía
  tsconfig paths).
- Gates: tsc 0 · vitest 84/84 (11 archivos; 26 tests motor nuevos) ·
  eslint lib/engine limpio · build 14 rutas.
- `lib/poker/`, app, store, rooms, agent intactos (mesa y salas funcionan).

## Decisiones del usuario

D1: motor nuevo en `lib/engine/` + migración posterior (cero riesgo prod).
D2: maximizar aprendizaje real → CLI local `npm run train` + app como visor;
rigor no negociable. Siguiente: P2 infosets.
