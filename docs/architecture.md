# Arquitectura — DilesZ/poker (2026-10-02, tras P1)

```
UI (/ page, /entrenar, /salas/[code], /api/rooms/*)
 ↓
Doble9739 decisión legacy: usePokerStore(Zustand+ai.ts) │ Room server(roomEngine+brain)
 ↓
Motores: lib/poker/game.ts (CONGELADO: dealing/showdown UI) │ lib/engine/ (NUEVO: canonical)
 ↓ evaluator/deck/potOdds (compartidos, sólidos, no tocar)
 ↓
Decisión: getAiAction(fijo) │ chooseBrainAction(ε-greedy) │ deriveStrategy(legacy)
 ↓
"Estrategia": StrategyVersion(169×0.5) │ Brain(40 priors) │ [P4: RegretNode]
 ↓
Training: runSelfPlay(seed ✓) │ [P6: trainer.train CLI]      Evaluation: [P3: evaluateAgent]
 ↓                                                               train-pop ≠ eval-pop
Persistence: localStorage(4 keys) + sessionStorage + Upstash KV(room:{CODE} EX 24h, CAS)
```

## Responsabilidades

- `lib/engine/`: ÚNICO motor canónico futuro. `types.ts` (PokerState inmutable,
  invariante `pot==ΣbetHand`), `rng.ts` (única aleatoriedad), `state.ts`
  (newEngineHand HU-aware), `betting.ts` (applyAction/getLegalActions,
  min-raise, short-raise), `settle.ts` (pots, refund, showdown, odd-chip).
- `lib/poker/`: legado UI. `game.ts` NO se amplía; `evaluator/deck` son finales.
- `lib/rooms/roomEngine.ts`: orquestación de salas + vistas sin leakage (no
  duplica reglas: migrará a `lib/engine` en P6).
- `store/usePokerStore.ts`: mesa local rápida (migrará a `lib/engine` en P6).
- `lib/agent/brain.ts`: agente online tabula rasa (se queda; P8 evaluará
  enchufar policies CFR como `chooseAction` alternativo).
- `lib/training/`: `@legacy` (solo lo usa `/entrenar` actual).

## Acoplamientos y duplicación

- Apuestas/turnos duplicados: `usePokerStore` vs `roomEngine` (ambos pre-P1;
  convergencia en `lib/engine` planificada, NO hacerla ahora).
- `refreshPot/buildSidePots/showdown` existen en `lib/poker/game.ts` Y en
  `lib/engine/settle.ts`: la versión canónica es la de `engine`.

## Código crítico / no tocar

- `lib/poker/evaluator.ts`, `deck.ts` (golden por 8+ tests).
- `lib/rooms/kv.ts` + `store.ts` (contrato Upstash verificado en prod).
- `lib/engine/*`: cambios solo con test que los cubra (regla P1).

## Bugs del legado documentados (no corregir en `lib/poker`, corregir en `engine`)

HU SB=button+1, sin refund uncalled, odd-chip por orden de array, `deal` a
foldeados, `draw` undefined silencioso, `currentBet=0` sin resetear `bet`,
`Math.random` sin seed en UI, "Aplicar a IA mesa" sin efecto.
