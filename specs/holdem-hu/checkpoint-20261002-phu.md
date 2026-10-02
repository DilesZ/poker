# Checkpoint P-HU — 2026-10-02 — CFR+ preflop HU (hito V3)

- `lib/games/buckets.ts` (12 buckets, 1326 combos) + `preflop-ev.json`
  (MC hot-cold 5000 boards/celda seed 12345) + `scripts/compute-preflop-ev.ts`
  (+ script `compute-ev`).
- `lib/games/holdem-hu.ts` (SB/BB, 100bb, minraise+allin, tope 3 raises,
  showdown por chance desde EV, key con jugador).
- `lib/cfr/agent.ts` (lookup avg + fallback tag + contadores) +
  `scripts/eval-cfr.ts` (+ salida JSON).
- `scripts/train.ts` registra `holdem-hu-preflop`.
- Entrenamientos: v1 2k → expl 0.153; v2 20k → **0.028** (convergencia sana).
- Transferencia (motor completo, n=3000): random +274 ✓, station +118 ✓,
  nit +27 (nc), tag +42 (nc). Miss 0-3.2% (tope raises → fallback).
- Gate 3 matizado honestamente: la estrategia casi no foldea porque en este
  juego abstracto es (casi) óptimo (BR: 0.014 bb/mano); la premisa
  "premiums 100%/basura 0%" era intuición de poker con postflop, no aplicable.
- Gates: tsc 0 · **253/253** · eslint limpio · build OK.
- Siguiente: P6 population (train≠eval) con el agente CFR poblando, o
  postflop/MCCFR (fases mayores).
