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
