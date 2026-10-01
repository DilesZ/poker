# Changelog

## [0.1.0] — 2026-10-01

Engine + docs cerrados:

- `lib/poker/game.ts`: flujo completo `newHand` (6 jugadores, stacks 1000, blinds 10/20), `postBlinds` (SB button+1, BB button+2, all-in si stack corto), `deal` (2 cartas), `advanceStreet` con `burn` (flop 3 → turn 1 → river 1 → showdown), `buildSidePots` por niveles, `showdown` con split equitativo + resto al primer ganador, helpers `handName` (0-8 → nombre) y `potOdds`. Compila con `tsc --noEmit`.
- `lib/poker/evaluator.test.ts`: 8 tests vitest en verde (trío>par, full>flush, split mesa, kicker, wheel A-2-3-4-5, escalera color>poker, poker>full en evaluate7, high-card + empate).
- `lib/poker/deck.ts`, `ai.ts`, `evaluator.ts`, `types.ts`, `lib/stats.ts` (V/D/E, winrate, racha, VPIP, ErrorTag 2 clics) verificados.
- `README.md`: descripción 6-max vs IA, features, comandos, import Vercel, env none, roadmap.
- `specs/spec.md`: reglas y criterios medibles v0.1.

Verificación: `npx tsc --noEmit` (0 errores), `npm test` (8/8).

### Verificado 2026-10-01 — checkpoint subida Vercel `DilesZ/poker`

- UI mesa felt estilo PokerStars: `PokerTable` + `Seat`/`Card` (6-max Hero + 5 IA), `ActionBar` (fold/call/raise), `HandLog`, `HudBankroll`, `ErrorTagger` 2 clics, `StrategyPanel` + `content/estrategias/basico.md`.
- IA `lib/poker/ai.ts` + store `usePokerStore.ts` + `app/page.tsx` + `/api/health`.
- Comandos verificados 2026-10-01:
  - `npm run typecheck` → 0 errores.
  - `npm test` → 8/8 passed (`lib/poker/evaluator.test.ts`).
  - `npm run build` → OK (Next 16.3.6 Turbopack, `Generating static pages (4/4)`, rutas `/`, `/_not-found`, `/api/health`).
