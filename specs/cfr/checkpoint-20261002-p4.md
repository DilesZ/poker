# Checkpoint P4 — 2026-10-02 — CFR tabular validado en Kuhn/Leduc

- `lib/cfr/game.ts` (interfaz extensiva), `node.ts` (RegretNode, regretMatching,
  average), `trainer.ts` (CFR vanilla exacto), `exploit.ts` (BR por policy
  iteration + exploitability), `checkpoint.ts` (versionado, sin sobrescribir).
- `lib/games/kuhn.ts` + `leduc.ts` (inmutables, zero-sum verificado).
- `scripts/train.ts` + `npm run train` (+ checkpoints reales
  `kuhn-cfr-v1.json` expl 0.001 con 50k, `leduc-cfr-v1.json` expl 0.018 con 5k).

## Bugs reales cazados por el gate de honestidad (no por tests previos)

1. **Keys sin jugador** (`Kuhn:Q|` colisionaba P0/P1): el CFR no convergía
   (expl 0.27 clavado). Fix: `Kuhn:<jug>:...`, `Leduc:<jug>:...` + tests de
   regresión. Lección: el gate Kuhn/Leduc cumplió su función.
2. **BR ingenuo = trampa**: max por camino condiciona en carta oculta
   (medido +0.33 vs verdadero −0.056). Reescrito por policy iteration exacta.
   Verificado contra perfil puro (+1.0 exacto) y a mano (on-policy −0.0555).
3. **`-0` vs `+0`** en splits Leduc (Object.is): normalizado en `utility`.
4. Tests con expectativas erróneas corregidos: strategySum ≈ 2n (2 caminos
   por iteración en recorrido exacto), nodo P0-ante-bet es `|pb` no `|b`.
5. `tsx` ausente en node_modules (`npm run train` fallaba): `npm install`.

## Gates

- tsc 0 · **231/231** (36 archivos; 17 tests CFR nuevos + convergencia) ·
  eslint limpio · build OK.
- Convergencia: Kuhn 5k → expl < 0.05 ✓ (medido ~0.005); Leduc 1500 → < 0.6 ✓.
- Prohibido importar `lib/engine` desde `lib/cfr` (vigente).
- Siguiente: P5 CFR+ (R+ truncado) y luego Hold'em HU con abstracción P2.
