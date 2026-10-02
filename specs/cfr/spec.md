# Spec P4 — CFR tabular (vanilla) validado en Kuhn/Leduc

## Objetivo

Primer aprendizaje con garantía matemática (no heurística). Gate de
honestidad: si no converge en Kuhn/Leduc, prohibido tocar Hold'em.

## Contratos

- `lib/cfr/game.ts`: interfaz mínima extensiva
  `CFRState { isTerminal, turn: 0|1|CHANCE(-1), legalActions(): string[],
  infosetKey(p): string, chanceOutcomes(): {action,prob}[],
  apply(a): CFRState, utility(p): number }` + `CFRGame { name, newInitial() }`.
  Utilidades zero-sum desde el jugador 0.
- `lib/cfr/node.ts`: `RegretNode { actions: string[], regretSum: number[],
  strategySum: number[] }`, `regretMatching(node): number[]` (proporcional a
  max(0,R); todo ≤0 → uniforme), `currentStrategy`, `averageStrategy`
  (normaliza strategySum; vacío → uniforme). Estructura lista para R+ (P5).
- `lib/cfr/trainer.ts`: `trainCFR({game, iterations, seed})` — recorrido
  exacto completo (sin muestreo; juegos pequeños), updates simultáneos:
  `R(I,a) += πc·π−i·(v(a)−v(σ))`, `S(I,a) += πi·σ(I,a)`. Determinista
  (seed guardada para futuro MCCFR).
- `lib/games/kuhn.ts`: ante 1, 3 cartas J/Q/K, 1 apuesta de 1, pass/bet,
  showdown carta alta. Valor del juego ≈ −1/18 (P0 pierde).
- `lib/games/leduc.ts`: 6 cartas (2 palos × J/Q/K), ante 1, 2 rondas
  (1 privada + 1 pública), apuestas 2/4, máx 2 subidas por ronda.
- `lib/cfr/exploit.ts`: `bestResponseValue(game, avgStrat, player)`,
  `exploitability = (br0 − br1)/2` en utils de P0 (0 en Nash).
- `lib/cfr/checkpoint.ts`: `{version, algorithm:"cfr", game, seed,
  iterations, nodes:{key:{actions,r,s}}, metrics:{exploitability}, timestamp,
  configHash}`. Guardar/cargar JSON en `checkpoints/`. Jamás sobrescribir:
  versionar nombre.
- `scripts/train.ts`: `npm run train -- --algorithm cfr --game kuhn
  --iterations 50000 --seed 12345 --out checkpoints/kuhn-cfr-v1.json` →
  imprime exploitability + guarda checkpoint. Solo `cfr` en P4 (cfr+ es P5).

## Aceptación

- tsc 0 · tests: regret matching (proporcional, uniforme en ≤0, average
  ponderada), reglas Kuhn/Leduc, **convergencia Kuhn** (expl < 0.02 tras
  N iters, rápido en test), **Leduc decrece** (expl(N) < expl(N/10)).
- `npm run train` reproduce los gates y deja checkpoint versionado.
- Prohibido importar `lib/engine` (Hold'em) desde `lib/cfr` en P4.
