# Checkpoint Replay-EV — 2026-10-02 — F27

- `lib/coach/ev.ts`: equityVsRandom (river exacto 990, turn exacto 45540,
  flop muestreado 3000 seed fija, preflop vía buckets), actionEV
  (fold/check→0, call→eq·pot−amount, bet+→unavailable), actionContext
  (potOdds≈amount/potAfter documentado), madeHandName.
- Store: HandRecord + heroHole/board al cerrar (compat: viejos sin cartas →
  unavailable sin romper).
- `components/coach/ReplayPanel`: timeline por calle con board slice + hole,
  EV/contexto por acción, "EV unavailable" donde toca, selector de manos.
- Unificación: el panel traía copia local INCORRECTA (heurística preflop
  inventada + equity sin runouts) → sustituida por imports de lib.
- Fix: timeout 60s al test de turn exacto (9.2s en suite paralela; no era
  fallo lógico) + caché por mano en el panel.
- Gates: tsc 0 · **293/293** (49 archivos) · eslint limpio · build OK.
- Fix post-push (build roto): `ReplayPanel → ev → buckets → node:fs`
  llegaba al bundle cliente (Turbopack panic). Partido `buckets.ts`:
  `buckets-data.ts` puro (importable en cliente) + loader fs fino;
  `ev.ts` importa el JSON empaquetado directo; `agent.ts` y `holdem-hu.ts`
  usan buckets-data. Build recuperado.
- Siguiente: F29 más errores, F22 experiment tracking, o postflop/MCCFR.
