# Checkpoint Coach-Datos — 2026-10-02 — F28

- `lib/coach/`: types (contrato canónico HandRecord/PosLabel),
  references (rangos medidos de la matriz v0 con fuente literal),
  analyzer (VPIP/PFR/3B/WTSD/aggro global + por posición; flags
  VPIP_ALTO_EP/PASIVO_POSTFLOP/OVERFOLD_BB solo con n≥15-20 y evidencia).
- Store: `histories` persistido (`poker-hands-v1`, cap 200) + `recordHand`
  auto en 4 cierres (fold/call/bet/showdown) + `clearHistories`; buffer no
  persistido; id sin Math.random.
- `components/coach/CoachPanel`: n siempre junto a cada %, tabla por
  posición, tarjetas con fuente+lección+evidencia; <5 manos pide jugar.
- Unificación (los 3 agentes corrieron en paralelo): el panel traía análisis
  propio y el store tipos propios → ambos importan de `lib/coach/*`
  (store reexporta para compat); guarda de calle en registrarAccionHero.
- Gates: tsc 0 · **282/282** (47 archivos) · eslint limpio · build OK.
- Siguiente: F27 replay con EV, F29 más errores, F22 experiment tracking.
