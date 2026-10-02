# Spec P2 — Information sets + abstracción de acciones

## Objetivo

Representación canónica observable (sin fugas) y espacio de acciones
configurable, base de CFR. Sin esto, entrenar es entrenar sobre información
privilegiada o sobre un espacio rígido.

## Contratos

- `PokerState.history?: string[]` (OPCIONAL, no rompe constructores):
  tokens `f|x|cN|bN|rN|aN` por acción y `/flop|/turn|/river|/showdown` por
  calle. `betting.applyAction` y `settle.advanceStreet` lo mantienen.
- `InformationSet`: street, heroSeat, buttonSeat, position
  (HU: button→SB; 6-max: +1 SB, +2 BB, +3 UTG, +4 MP, +5 CO, +0 BTN),
  numActive, hole SOLO del héroe (2, si no throw), board, pot, stacks,
  betsStreet/betsHand, toCall, minRaiseTo, stackHero, effectiveStack
  (min(héroe, max resto activo)), lastAggressor, actingSeat, bettingHistory,
  legal, handId, seed. **Prohibido**: hole ajenas, deck, futuro.
- `getInformationSetKey`: determinista, compacta, serializable
  (`AhKs|Kc7h2d-r|BTN|flop|p120|...`). Test negativo: mismo infoset con
  distinto hole rival → MISMA key y el JSON no contiene esas cartas.
- `ActionAbstractionConfig`: preflopOpenTo, flop/turn/riverBet sizes,
  raiseTo, alwaysAllowAllIn. `STANDARD` (2.5bb; 33/50/75%; min y 2x),
  `SMALL`, `LARGE`. `expandActions(legal,street,bb,pot,cfg,...)` con clamp a
  bounds de `LegalActions` y dedup. El motor NO cambia al experimentar.

## Aceptación

- tsc 0 · 14 tests nuevos (6 infoset + 8 actions) · eslint limpio · build.
- Ningún test existente modificado (history opcional).
- Decisión P4+ consumirá `InformationSet`, nunca `PokerState` crudo.
