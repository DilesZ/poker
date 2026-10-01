# Checkpoint 2026-10-01 — Poker Coach v0.1.0

Fecha: 2026-10-01
Repo objetivo: `DilesZ/poker` (solo contenido de `poker/`, no raíz)
Estado: build / typecheck / tests verdes, listo para subir e importar en Vercel.

## 1. Qué se sube

Texas Hold'em 6-max vs IA estilo PokerStars:

- **Engine:**
  - `lib/poker/evaluator.ts` — `evaluate7` + ranking 0-8, desempates por kickers, wheel A-2-3-4-5.
  - `lib/poker/game.ts` — `newHand` (6 jugadores, stacks 1000, blinds 10/20), `postBlinds` (SB button+1, BB button+2, all-in si stack corto), `deal` (2 cartas), `advanceStreet` con `burn` (flop 3 → turn 1 → river 1 → showdown), `buildSidePots` por niveles, `showdown` con split equitativo + resto al primer ganador, `handName`, `potOdds`.
  - `lib/poker/ai.ts` — heurística: push/fold <10bb, value bet 50-75% pot, 15% varianza/bluff, defensa por pot odds.
  - `lib/poker/deck.ts`, `lib/poker/types.ts` — mazo Fisher-Yates + tipos (Card, Player, GameState, Street).
  - `lib/poker/evaluator.test.ts` — 8 tests vitest en verde.
- **UI mesa felt estilo PokerStars:**
  - `components/poker/PokerTable.tsx` — mesa oval felt + board + bote + calles.
  - `components/poker/Seat.tsx`, `Card.tsx` — 6 asientos (Hero + 5 villanos IA).
  - `components/poker/ActionBar.tsx` — fold / call / raise.
  - `components/poker/HandLog.tsx` — log mano a mano.
  - `components/poker/HudBankroll.tsx` — bankroll + stacks.
  - `components/poker/ErrorTagger.tsx` — tag errores en 2 clics (`VPIP_ALTO`, `SIN_POSICION`, `OVERBET`, `CALL_SIN_ODDS`, `TILT`, `OTRO`).
  - `components/poker/StrategyPanel.tsx` + `content/estrategias/basico.md` — panel estrategias.
- **Estado / stats:**
  - `store/usePokerStore.ts` — estado partida (zustand).
  - `lib/stats.ts` — V/D/E en localStorage (`poker-stats-v1`), winrate %, racha, VPIP %.
- **Verde verificado 2026-10-01:**
  - `npm run typecheck` (`tsc --noEmit`) — 0 errores.
  - `npm test` (`vitest run`) — 8/8 passed (`lib/poker/evaluator.test.ts`).
  - `npm run build` (`next build` 16.3.6 Turbopack) — compilado OK, TypeScript OK, `Generating static pages (4/4)`, rutas `/`, `/_not-found`, `/api/health`.

## 2. Estructura de archivos (lo que se sube)

```text
poker/
  app/
    page.tsx
    layout.tsx
    api/health/route.ts
  components/poker/
    PokerTable.tsx
    Seat.tsx
    Card.tsx
    ActionBar.tsx
    HandLog.tsx
    HudBankroll.tsx
    ErrorTagger.tsx
    StrategyPanel.tsx
  lib/
    stats.ts
    poker/
      types.ts
      deck.ts
      evaluator.ts
      evaluator.test.ts
      game.ts
      ai.ts
  store/usePokerStore.ts
  content/estrategias/basico.md
  specs/
    spec.md
    checkpoint-20261001.md
  docs/CHANGELOG.md
  README.md
  package.json
  tsconfig.json
  next.config.ts
  vercel.json
  vitest.config.ts
  .gitignore
```

No subir: `node_modules/`, `.next/`, `tsconfig.tsbuildinfo`.

## 3. Cómo importar en Vercel

1. Subir esta carpeta como repo GitHub `DilesZ/poker` (root = `poker/`, no la raíz `EspañaSettlers/`).
2. Vercel → **Add New Project → Import** `DilesZ/poker`.
3. Framework preset: **Next.js** (autodetectado vía `vercel.json` con `"framework": "nextjs"`).
4. Build command: `npm run build`. Output: por defecto Next.
5. Sin envs: **no añadir variables de entorno** (stats en localStorage, IA sin API externa).
6. Deploy → verificar `/` carga mesa y `/api/health` responde OK.

## 4. Próximo paso

- **Coach explicativo:** pot odds en vivo + equity Monte Carlo + feedback post-mano (“por qué fold/call/raise aquí”).
- **Stats VPIP:** extender `lib/stats.ts` — VPIP por posición, PFR, HUD en mesa.
- **Tests e2e:** Playwright — flujo nueva mano → blinds → flop/turn/river → showdown, ActionBar deshabilitado fuera de turno, persistencia bankroll.
