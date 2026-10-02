# Spec P1 — Motor de apuestas canónico (`lib/engine/`)

## Objetivo

Simulador correcto, inmutable y determinista sobre el que entrenar. Estado P0:
`lib/poker/game.ts` es un esqueleto sin acciones (ver auditoría).

## Contratos

- `PokerState` inmutable; `pot == ΣbetHand` siempre; conservación
  `Σstack + pot == total`.
- `EngineAction`: fold | check | call | bet{amount a poner} | raise{to total
  en calle} | allin.
- `getLegalActions(state,seat) → LegalActions` (bounds, no lista).
- `applyAction` inmutable, errores descriptivos en acción ilegal.
- Min-raise = BB o último incremento; short-raise all-in NO reabre
  (currentBet sube, minRaise/lastAggressor intactos).
- Orden: preflop UTG (button+3; HU actúa SB=button), postflop desde button+1;
  cierre al volver al agresor/ancla con todo igualado (BB conserva opción
  tras limp).
- Ciegas HU: SB=button, BB=otro. Ante (0 por defecto).
- `advanceStreet` solo con calle cerrada; quema+reparte; resetea betStreet,
  currentBet, minRaise=bb; runout con actingSeat null.
- `refundUncalled` antes de botes; odd-chip de 1 en 1 a la izquierda del button.
- `createRng(seed)` única aleatoriedad; prohibido `Math.random` en `lib/engine`.

## Aceptación

- `npx tsc --noEmit` 0 errores.
- `npm test`: 26 tests motor (conservación en 20 manos aleatorias completas,
  side pots multi all-in, refund, splits + odd chips, min-raise/re-raise,
  foldeados/all-in/cero-stack, deck insuficiente, HU blinds/orden,
  determinismo por seed).
- `npx eslint lib/engine` limpio; `npm run build` verde.
- `lib/poker/`, `app/`, `store/`, `lib/rooms/`, `lib/agent/` intactos
  (evolución incremental, mesa actual sigue funcionando).
