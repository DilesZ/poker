# Spec Replay-EV — F27 (revivir manos con EV por acción)

## Objetivo

Ver cada mano importante calle por calle: decisión, equity, pot odds, EV
estimado y alternativas. Si no hay EV fiable: **"EV unavailable"**, nunca
inventado.

## Contratos

- `HandRecord` añade `heroHole?: Card[]` y `board?: Card[]` (OPCIONALES:
  historiales viejos sin cartas → replay degradado a "EV unavailable").
  `Card` de `lib/poker/types`. Store los captura al cerrar (siguen en el
  estado: hole del héroe aunque foldee + board final; calles por slice:
  flop 3 / turn 4 / river 5).
- `lib/coach/ev.ts`:
  `EquityResult { equity, sampleSize, exact }`,
  `equityVsRandom(hole:[Card,Card], board:Card[]): EquityResult`:
  river exacto (990 villanos), turn exacto (990×44), flop muestreado
  (3000 pares villano+board, seed fija), preflop (board 0) vía tabla
  buckets (`loadEvTable` + media ponderada de la fila). Sin Math.random.
  `EvEstimate = {kind:"exact",evBB} | {kind:"unavailable",reason}`,
  `actionEV(rec, idx, bb): EvEstimate`: fold→0 exacto; check→0 exacto
  (la acción no compromete fichas); call→`eq*potAfter − amount` exacto
  con equity de ese momento; bet/raise/allin→unavailable ("requiere
  modelo de fold rival") + `actionContext(rec,idx):
  {potOdds,equity,equityExact,madeHand,needed}` para mostrar.
  `madeHandName(hole,board)`: best5 si ≥5 cartas, si no "preflop".
- `components/coach/ReplayPanel.tsx`: selector de mano (última por
  defecto), timeline por calle (board slice + hole + acciones del héroe
  con EV/contexto), resultado. "EV unavailable" visible donde aplique.
  Cableado en sidebar tras CoachPanel. Sin dependencias ni CSS nuevo
  (reutilizar clases).

## Aceptación

- tsc 0 · tests: fold EV 0; river nuts equity 1 → call EV exacto a mano;
  flop muestreado determinista (misma seed); preflop usa buckets;
  bet→unavailable con reason; store guarda cartas; historiales viejos
  (sin cartas) → unavailable sin romper.
- Build OK.
