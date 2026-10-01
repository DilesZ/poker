# Spec — Poker Coach (DilesZ/poker)

## 1. Objetivo

Texas Hold'em estilo PokerStars 6-max vs IA + aprendizaje, desplegado en Vercel como repo separado `DilesZ/poker`.

## 2. Stack

- Next.js 16.3.6 (App Router), React 19.2.8, zustand ^5
- TypeScript ^5, ESLint ^9, Vitest ^3
- Deploy: Vercel dinámico (sin `output: export`)

## 3. Alcance v0.1 (engine + docs)

- `package.json`, `next.config.ts`, `tsconfig.json`, `vercel.json`, `.gitignore`, `README.md`
- `lib/poker/deck.ts`, `evaluator.ts`, `game.ts`, `ai.ts`, `types.ts`, `lib/stats.ts`
- `lib/poker/evaluator.test.ts`, `specs/spec.md` (este archivo), `docs/CHANGELOG.md`
- Verificable con: `npm install`, `npm run typecheck`, `npm test`, `npm run build`

## 4. Reglas (motor v0.1)

1. **Mesa**: 2-10 jugadores (defecto 6), stacks 1000, botón rotativo, Hero = id 0.
2. **Blinds**: `postBlinds` cobra SB (button+1, 10) y BB (button+2, 20); si stack < ciega → all-in; `currentBet = BB`.
3. **Deal**: `deal` reparte 2 cartas a cada jugador (orden round-robin, sin burn preflop).
4. **Calles**: `advanceStreet` quema 1 (`burn`) y luego flop (3) → turn (1) → river (1) → showdown; resetea `currentBet = 0` entre calles (sin apuestas modeladas aún).
5. **Side pots**: `buildSidePots(players)` agrupa por niveles distintos de `bet`; cada nivel aporta `(level - prev)` por jugador con `bet >= level`; solo no-folded en `eligible`.
6. **Showdown**: evalúa `hole (2) + board` con `evaluate7`; gana mejor `compareRanks`; split `floor(pot/n)` + resto 1 a 1 a primeros por posición; fija `street = "done"` y `winners`.
7. **Helpers**: `handName(category 0-8)` → `CATEGORY_NAMES` (`high card`…`straight flush`), `unknown` si fuera de rango; `potOdds(toCall, pot) = toCall/(pot+toCall)`, 0 si `toCall<=0`, throw si `pot<0`.
8. **Stats**: `V/D/E` en localStorage `poker-stats-v1`; winrate %, racha, VPIP %; `ErrorTag` en 2 clics.

## 5. Criterios medibles (aceptación v0.1)

- `npx tsc --noEmit` → 0 errores.
- `npm test` → `lib/poker/evaluator.test.ts` ≥8 tests, 8/8 en verde (jerarquía, kicker, split, wheel).
- `newHand(6)` → 6 players, stacks 1000, deck 52; `postBlinds + deal` → SB bet 10, BB bet 20, 2 hole c/u, deck 52-12=40; `advanceStreet ×3` → board 3→4→5 con burn (deck -6); `buildSidePots` con all-in desigual → ≥2 pots cuya suma = `pot`; `showdown` board escalera común → empate y split exacto.
- `handName(8) = "straight flush"`, `handName(99) = "unknown"`; `potOdds(20,80) = 0.2`.
- `npm run build` pasa en local y en Vercel; import `DilesZ/poker` en Vercel (Add New Project → Import) detecta Next.js; env none.

## 6. No-objetivos v0.1

- Sin multijugador real, sin dinero real, sin auth.
- Sin ronda de apuestas completa entre calles (v0.2+), sin UI mesa (v0.2), sin niveles IA seedables (v0.3).

## 7. Roadmap

- v0.2: UI mesa (oval, asientos, chip animations, fold/call/raise)
- v0.3: IA (heurística por niveles + RNG seedable)
- v0.4: coach (pot odds, equity Monte Carlo, feedback post-mano)
- v0.5: aprendizaje (lecciones markdown, quizzes, hand review)

## 8. Self-play v0.2 (entrenar, sin romper la mesa)

- `lib/training/selfplay.ts`: `runSelfPlay(nHands, seed, strategy?)`
  simula manos 6-max headless con RNG seeded (mulberry32, restaura
  `Math.random`), sin mutar la estrategia de entrada. Rondas de apuesta
  (hasta 3 pasadas/calle), `decideWithStrategy` (push/fold determinista
  por umbral de posición con <10bb; si no, `getAiAction` + sizing según
  `sizingWeights`), `showdown` del motor y reward en bb. Devuelve
  `{ hands, winrateBB100, byPosition, showdownPct (0-1), experiences,
  updatedStrategy }` con update de regret simple (LR 0.05) por mano.
- `lib/training/strategy.ts`: `StrategyVersion` versionada (umbrales
  push/fold por posición, 169 pesos de rango, sizings) con `migrate`,
  `load/saveStrategy` en localStorage `poker-strategy` (SSR-safe).
  `lib/training/experience.ts`: buffer de hasta 500 experiencias.
- `components/training/SelfPlayPanel.tsx` (client): botón "Entrenar 1000
  manos vs sí misma", chunks de 50 vía `setTimeout` (no congela UI), barra
  de progreso, winrate bb/100, showdown%, versión y "Aplicar a IA mesa".
- `app/entrenar/page.tsx`: compone panel + explicación honesta (qué
  aprende y qué NO es GTO) + límites legales. No modifica `app/page.tsx`.
- Aceptación: 1000 manos completan sin congelar; con 6 asientos iguales el
  winrate ≈ 0 ± varianza; `tsc --noEmit` 0 errores.

## 9. Torneos SNG v0.2 (demo local)

- `lib/tournament/sng.ts`: 7 niveles (10/20 → 150/300+50), subida cada
  `HANDS_PER_LEVEL = 8` manos, stack 1500, pagan 2.
- `components/tournament/TournamentBar.tsx` (client, autocontenido, sin
  store): nivel, ciegas/ante, manos para subir, tabla de 6 por fichas en
  BB, badges Burbuja (3 vivos) / ITM (≤2) / Eliminado, botones "Jugar
  mano" y "Nuevo SNG". Sorteo uniforme simplificado, documentado en UI.
- Aceptación: ciegas suben cada 8 manos; badges correctos al eliminar;
  `tsc --noEmit` 0 errores.

## 10. Salas privadas + agente tabula rasa v0.3 (2026-10-02)

- Salas: `lib/rooms/` (roomEngine, store CAS por version, memory dev / kv Upstash prod) + API `/api/rooms/*` force-dynamic. Crear/unirse por codigo, 1v1 o N+agente, mesa 2-6.
- Agente: `lib/agent/brain.ts` SIN estrategia predefinida (prohibido importar lib/training o ai.ts): priors uniformes 0.5, epsilon 0.9 -> 0.1, epsilon-greedy, reflectOnHand tras cada showdown (+0.05/-0.04, Lesson en espanol).
- UI: `/salas` (crear/unirse), `/salas/[code]` (polling 2s, banner turno, overlay), `AgentDiary` (ultimas 8 lecciones).
- Aceptacion: tsc 0, vitest 54/54, build 14 rutas, smoke E2E real con leccion generada por derrota. Ver `specs/checkpoint-20261002-v03-salas.md`.
