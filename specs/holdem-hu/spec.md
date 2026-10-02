# Spec P-HU — CFR+ a Hold'em heads-up PRE-FLOP (hito V3)

## Objetivo

Primer aprendizaje medible en poker real (no juguetes). Alcance honesto y
deliberadamente acotado: **solo preflop, solo HU, 12 buckets**. Postflop,
6-max y MCCFR son fases posteriores.

## Contratos

- `lib/games/buckets.ts`: 12 buckets con `combos` (suman 1326) y `prob`
  marginal; `bucketOf(c1, c2): string` determinista (orden canónico).
  Reparto de buckets INDEPENDIENTE (aproximación documentada: ignora
  card-removal; el EV lo compensa en media).
- `scripts/compute-preflop-ev.ts` → `lib/games/preflop-ev.json` (12×12,
  seed fija, N boards/celda documentado): EV hot-cold del bucket fila vs
  columna (empates repartidos; EV[a][b] ≈ 1−EV[b][a]).
- `lib/games/holdem-hu.ts`: `CFRGame "holdem-hu-preflop"`.
  - Chance reparte buckets (marginales); posiciones SB/BB; stacks 100bb,
    sb 0.5bb, bb 1bb (unidades: ciegas en fichas sb=1, bb=2, stack=200).
  - Acciones abstractas: fold/check/call/minraise/allin (de `expandActions`
    SMALL-ish fijo en el juego; configurable después). Tope 3 raises: luego
    solo call/fold/allin (árbol finito).
  - Historial abstracto: `abstractHistory(tokens: string[]): string` mapea
    tokens P2 (`f|x|c*|r*|a*`, solo preflop: sin `/`) a `f|x|c|r|a`. La MISMA
    función la usa el agente en runtime (mapeo exacto train↔play).
  - Terminal fold → bote al otro. Showdown (línea sin folds) → nodo chance
    `{A-gana, empate, B-gana}` con probs de la tabla EV → payoffs netos.
  - Key: `HU:<bucket>:<P0|P1>:<SB|BB>:<hist>` (jugador incluido: lección P4).
- `lib/cfr/agent.ts`: `loadCfrPreflopAgent(checkpointPath, fallbackId):
  BaselineAgent & { misses(): number }`. `decide(info, rng)`: si
  `street!=="preflop"` → fallback; si no: bucket+hist abstracto+pos →
  lookup en avg del checkpoint → sample con rng; miss → fallback + contador.
  Agente etiquetado `cfr-preflop+tag-post` (honesto: postflop no aprendido).
- `scripts/eval-cfr.ts`: `--ckpt <ruta> --b <baseline> --hands N --seed S
  [--fallback tag]` (misma tabla que evaluate).
- `scripts/train.ts`: registra `holdem-hu-preflop` (carga EV table; error
  claro si falta el JSON con instrucción de generarlo).

## Gates honestos (pre-registrados)

1. En juego abstracto: expl(N) < expl(N/10) (aprende de verdad).
2. Vs baselines (2000+ manos, seed fija): bate a random+station con IC95%
   que excluya 0; vs tag/nit se reporta sin exigir victoria.
3. Estrategia no trivial: open% monotonía razonable por bucket (premiums
   ~100%, basura ~0%) — test que lo verifica, no eyeballing.
4. Prohibido llamar "GTO" a esto: es "CFR+ preflop HU con 12 buckets".

## Limitaciones declaradas

Sin postflop, sin 6-max, buckets independientes (sin removal), fallback
postflop = tag, SHOWN EV por Monte Carlo (no exacto).
