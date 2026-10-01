# Changelog

## [0.3.0] — 2026-10-02

Salas privadas + agente tabula rasa:

- `lib/rooms/`: roomEngine (acciones server-side, cierre de ronda, showdown, orquestación agente), store CAS por versión, memory (dev) + kv Upstash (prod, opcional por env), tests 15+9+11.
- `app/api/rooms/*`: create/join/state(204 si version igual)/action/leave, `force-dynamic`. Turnos validados en servidor; si toca al agente actúa `chooseBrainAction`.
- `lib/agent/`: brain.ts priors uniformes 0.5 + ε 0.9→0.1, epsilon-greedy puro SIN estrategia predefinida, reflectOnHand (+0.05/−0.04 clip, lección en español), reflection.ts, tests 4.
- `app/salas` + `app/salas/[code]` + `components/rooms/AgentDiary`: crear/unirse por código, mesa remota polling 2s con banner de turno y overlay, diario del agente visible.
- Smoke E2E real: sala 1v1 completa, derrota del agente → lección "bajé a 0.46 la prior de ir all-in en river".

Verificado: `tsc` 0, `vitest` 54/54, `next build` 14 rutas. Ver `specs/checkpoint-20261002-v03-salas.md`.

## [0.2.0] — 2026-10-01

Self-play + SNG (legado, no participa en salas): `lib/training/` (regret tabular), `lib/tournament/` (7 niveles, payouts 65/35), `/entrenar`, `useTournamentStore`. 15 tests. Commits e7b381a/ed21113.

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
