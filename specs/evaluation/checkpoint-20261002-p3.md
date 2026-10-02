# Checkpoint P3 — 2026-10-02 — Baselines + evaluación

- `lib/baselines/`: 7 agentes v0 congelados (random, calling-station, nit,
  tag, lag, maniac, gto-lite) + `strength.ts` (tiers, best5) + 5 tests.
  Deterministas dado rng, sin Math.random, deciden solo desde InformationSet.
- `lib/eval/match.ts`: HU con button alterno + **asientos fijos** (bug
  encontrado y corregido: `asientoA=button` dejaba a A siempre SB y hundía
  VPIP/WTSD a 6.5%/2.5%; tras el fix, random VPIP 43.6%), stats desde history
  (VPIP/PFR/3B/WTSD/W$SD/aggro/dist), bb/100 + SD + IC95%. + 6 tests.
- `scripts/evaluate.ts` + `npm run evaluate` (+ `--json`); fix `dist: s/d`
  (campo real `actions`). + 4 tests. vitest incluye `scripts/**`.
- Matriz 21 duelos × 5000 manos seed 7 en `docs/benchmarks.md` + crudos en
  `benchmarks/raw/`: suma cero (+0.1), antisimetría exacta, CIs reportados.
- Gates: tsc 0 · **206/206** (30 archivos) · eslint limpio · build OK.
- Siguiente: P4 CFR tabular validado en Kuhn/Leduc.
