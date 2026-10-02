# Checkpoint merge — 2026-10-02 — P1 engine + línea liga/cerebro

## Situación

Trabajo paralelo en `origin/main` (16 commits `0b35df8..dff85c0`, otra línea):
liga on-policy, cerebro v2/v3, dream, evaluate, trainer, jobs, globalStore,
equity Monte Carlo, CoachFeedback, rediseño UI, cron diario, `npm run liga`.
Mi P1 (`93a77d1` local) se hizo rebase limpio sobre `dff85c0`: **cero
conflictos** (solapes en `app/page.tsx`/`globals.css` autofusionados; su
rediseño ya enlaza `/salas` y `/entrenar`).

## Veredicto de compatibilidad (revisión + gates)

- Contrato de salas intacto: la liga solo consume
  `createBrain/chooseBrainAction/reflectOnHand` + `buildHandRecord`.
- Su aprendizaje es tabular por ventaja (1 paso, sin árbol): real pero NO CFR;
  coherente con el roadmap (evaluate≈P3 parcial, liga≈P6 parcial).
- Riesgo registrado: liga/eval/rooms usan el loop legacy de `lib/poker/game`;
  NO usan `lib/engine/` todavía. Si salas migran a engine, revalidar
  `sumaBB≈0` y `showdown%` (divergen sizing/all-in/side-pots/orden).
- Fix propio del merge: `sufijoRivales` muerto en `reflection.ts` (warning
  eslint) eliminado.

## Gates del árbol fusionado

- `tsc` 0 errores · `vitest` **177/177** (25 archivos: 151 liga + 26 motor)
  · `eslint lib/engine lib/agent` limpio · `next build` OK (17 rutas,
  incluye `/api/agent/{brain,eval,liga,train}`).

## Siguiente

P2 infosets sobre `lib/engine/` (spec `specs/infosets/`). La liga sigue
intacta y evaluable; la migración de salas/mesa a engine va después (P6).
