# Poker Coach — Texas Hold'em estilo PokerStars 6-max vs IA

Mesa de Texas Hold'em 6-max estilo PokerStars para jugar contra IA, con coach y módulo de aprendizaje. Repo separado `DilesZ/poker`, deploy en Vercel.

## Features

- **Mesa 6-max**: oval estilo PokerStars, 6 asientos (Hero + 5 villanos IA), board, bote y calles preflop → flop → turn → river → showdown.
- **Blinds**: SB 10 / BB 20 por defecto (`postBlinds`), con all-in automático si stack insuficiente.
- **Side pots**: `buildSidePots` por niveles de apuesta para all-ins desiguales.
- **Showdown**: `showdown` con `evaluate7`, split equitativo + chip impar al primer ganador por posición, `handName` para la categoría ganadora.
- **Bankroll**: stacks de 1000 por defecto, persistibles; `potOdds(toCall, pot)` para decisiones.
- **Historial V/D**: `lib/stats.ts` guarda `V/D/E` en localStorage (`poker-stats-v1`), winrate %, racha actual y VPIP %.
- **Tag errores 2 clics**: `ErrorTag` (`VPIP_ALTO`, `SIN_POSICION`, `OVERBET`, `CALL_SIN_ODDS`, `TILT`, `OTRO`) registrable en 2 clics post-mano.
- **Estrategias**: IA heurística (`lib/poker/ai.ts`) — push/fold <10bb, value bet 50-75% pot, 15% varianza/bluff, defensa por pot odds; base para niveles tight/loose/GTO-lite.

## Comandos

```bash
npm install
npm run dev      # Next.js local
npm run build    # build producción (Vercel)
npm test         # vitest run (evaluador 8 tests)
npm run typecheck # tsc --noEmit
npm run lint     # next lint
```

## Cómo importar DilesZ/poker en Vercel

1. Sube esta carpeta como repo GitHub `DilesZ/poker`.
2. En Vercel: **Add New Project → Import** `DilesZ/poker`.
3. Framework preset: Next.js (autodetectado, ver `vercel.json`).
4. Build command: `npm run build`. Output: por defecto Next.
5. Deploy. No requiere configuración extra.

## Env

None — sin variables de entorno. Stats en localStorage, IA sin API externa.

> `next.config.ts` no usa `output: export` para mantener render dinámico en Vercel.

## Roadmap

- [x] v0.1 Engine: `deck` + `evaluator` + `game` (newHand, blinds, deal, streets con burn, side pots, showdown split, handName, potOdds) + 8 tests + docs
- [ ] v0.2 UI mesa oval, asientos, chip animations, acciones fold/call/raise
- [ ] v0.3 IA por niveles + RNG seedable + bankroll persistente
- [ ] v0.4 Coach: pot odds en vivo, equity Monte Carlo, feedback post-mano
- [ ] v0.5 Aprendizaje: lecciones markdown, quizzes, hand review + historial V/D y tags
- [ ] v1.0 Auth + persistencia + leaderboard

## v0.2 — Entrenar + Torneo SNG (nuevo, sin romper la mesa)

- **Entrenar** (`/entrenar`): `SelfPlayPanel` juega 1000 manos de la
  estrategia contra sí misma en chunks de 50 (setTimeout, sin congelar la
  UI). Motor determinista por seed: `runSelfPlay(nHands, seed, strategy)`
  con rondas de apuesta, `decideWithStrategy` (push/fold por posición
  <10bb, sizings 33/50/75%) y update por regret simple sobre la clase de
  mano. Muestra progreso, winrate bb/100, showdown% y versión. **Honesto:
  NO es GTO** (sin rangos balanceados, sin adaptación al rival). Botón
  "Aplicar a IA mesa" guarda en localStorage (`poker-strategy`).
  > `@legacy` desde el roadmap AI (ver `docs/AI_ROADMAP.md`): `lib/training/`
  > es un ajuste tabular win/loss, NO regret minimization (sin `regretSum` /
  > `strategySum`). Se mantiene porque `/entrenar` lo usa; el camino CFR
  > empieza en `lib/engine/` (P1) y `docs/AI_ROADMAP.md` (P2+).
- **Torneo** (`TournamentBar`, en `/entrenar`): SNG 6-max demo con niveles
  de ciegas/ante cada 8 manos, tabla ordenada por fichas en BB y badges
  Burbuja (3 vivos) / ITM (≤2) / Eliminado. Botón Nuevo SNG. Sorteo
  simplificado, sin dinero real.
- **Legal**: solo self-play local, sin dinero real, prohibido usar bots en
  salas externas. La mesa existente (`/`) no se modifica.
