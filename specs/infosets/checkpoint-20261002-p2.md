# Checkpoint P2 — 2026-10-02 — Infosets + abstracción

- `PokerState.history?: string[]` (opcional, no rompe nada): `betting`
  añade `f|x|cN|bN|rN|aN`, `settle.advanceStreet` añade `/calle`.
- `lib/engine/infoset.ts`: `InformationSet` (solo observables del héroe),
  `positionOf` (HU + 6-max), `getInformationSet`,
  `getInformationSetKey` (`AhKs|Kc7h2d-r|BTN|flop|...`).
- `lib/engine/actions.ts`: `ActionAbstractionConfig` + STANDARD/SMALL/LARGE
  + `expandActions` (clamp a `LegalActions`, dedup). Motor intacto.
- Fix propio: paréntesis en `boardStr` (línea 162).
- Gates: tsc 0 · **191/191** (27 archivos; 14 tests P2 nuevos: 6 infoset
  incl. test negativo de no-leakage + 8 actions) · eslint limpio · build OK.
- Siguiente: P3 baselines + `evaluateAgent` + `npm run evaluate`.
