# Spec Coach-Datos — F28 (coach basado en manos reales)

## Objetivo

El coach deja de recitar reglas estáticas: analiza las manos QUE el héroe
jugó (posición, acción, bote) y compara contra referencias MEDIDAS
nuestras, siempre con n y fuente. Sin n no hay porcentaje.

## Contratos

- `lib/coach/types.ts`: `HandAction { street, seat, action:
  "fold"|"check"|"call"|"bet"|"raise"|"allin", amount, potAfter }`,
  `HandRecord { id, ts, heroSeat, button, positions: Record<seat, PosLabel>,
  actions: HandAction[], result: { bbWon: number; showdown: boolean } }`,
  `PosLabel = "SB"|"BB"|"UTG"|"MP"|"CO"|"BTN"`.
- `lib/coach/references.ts`: rangos medidos (NO universales), cada uno con
  `{ metric, pos?, low, high, source }`. Fuente inicial: matriz baselines v0
  (`docs/benchmarks.md`, n=5000, seed 7): tag VPIP 10%/PFR 3% global como
  proxy tight; se refinan por posición en P-futuro con self-stats. Los
  mensajes del coach CITAN la fuente.
- `lib/coach/analyzer.ts`:
  `analyzeHistories(hands: HandRecord[]): CoachReport`
  `{ sampleN, overall: {vpip,pfr,threeBet,wtsd,showdownRate,aggro},
  byPosition: Record<PosLabel, {hands,vpip,pfr}>,
  flags: CoachFlag[] }`,
  `CoachFlag { id, kind, title, detail, evidenceHandIds: string[],
  source: string }`. Kinds v1: `VPIP_ALTO_EP` (UTG+MP vpip > ref+10pp con
  n≥20), `PASIVO_POSTFLOP` (aggro < 0.5 con n≥20), `OVERFOLD_BB`
  (fold BB vs open > 85% con n≥15). Cada flag exige n mínimo o NO se emite
  (muestra pequeña → mensaje "juega N manos más", nunca veredicto).
- Store (`usePokerStore`, editar con cuidado): `histories: HandRecord[]`
  persistido (`poker-hands-v1`, cap 200, poda oldest) + acción `recordHand`
  llamada al cerrar CADA mano (showdown y uncontested), con positions desde
  button y resultado en bb (stack final − inicial)/bb. Sin romper estado
  existente.
- `components/coach/CoachPanel.tsx`: lee histories del store, muestra
  sampleN, tabla por posición, flags con evidencia (ids de mano clicables
  que filtran HandLog si es trivial; si no, texto), y siempre la fuente.
  Cableado en `app/page.tsx` sidebar (sin quitar nada).

## Aceptación

- tsc 0 · tests: analyzer con historiales sintéticos (VPIP/PFR por posición
  exactos, flag solo con n suficiente, evidencia apunta a manos reales);
  store recordHand persiste y poda a 200; referencias citan fuente.
- Jugar 1 mano local genera 1 HandRecord visible en el panel.
- Build OK.
