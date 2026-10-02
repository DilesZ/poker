# Benchmarks — baselines v0 (línea base eterna)

> Congelado: `lib/baselines/* v0` + `lib/eval/match.ts`. Esta matriz es la
> referencia contra la que se medirá todo aprendizaje futuro. No editar los
> números; añadir nuevas matrices debajo con fecha.

## Metodología

- Heads-up, stacks 1000, blinds 10/20, button alterno + asientos fijos.
- n = **5000 manos** por duelo, **seed 7** (misma secuencia base en todos).
- 21 duelos (todos contra todos). Celda = bb/100 del **fila** vs columna.
- IC95% = ±1.96·SD/√n en bb/100. Sin n no hay winrate; sin IC no hay "mejor".
- Reproducir: `npm run evaluate -- --a <id> --b <id> --hands 5000 --seed 7`
  (JSON crudos en `benchmarks/raw/`).

## Matriz bb/100 (2026-10-02, seed 7, n=5000)

| fila \ col | random | station | nit | tag | lag | maniac | gto-lite |
|---|---|---|---|---|---|---|---|
| random | — | +39.8 | -22.8 | -45.8 | -222.0 | -288.0 | -29.6 |
| station | -39.8 | — | -8.9 | -36.6 | -226.6 | -840.7 | -27.1 |
| nit | +22.8 | +8.9 | — | -0.8 | +42.8 | +82.0 | -6.4 |
| tag | +45.8 | +36.6 | +0.8 | — | +55.7 | +96.0 | -8.4 |
| lag | +222.0 | +226.6 | -42.8 | -55.7 | — | +233.7 | -36.6 |
| maniac | +288.0 | +840.7 | -82.0 | -96.0 | -233.7 | — | +4.8 |
| gto-lite | +29.6 | +27.1 | +6.4 | +8.4 | +36.6 | -4.8 | — |

Semianchos IC95% típicos: ±8–15 (duelos tight) hasta ±40 (duelos con
maniac: muchos all-ins). Celdas |bb/100| < ~15 vs maniac y < ~8 en resto:
**no significativas** (ej. tag-nit +0.8, maniac-gto-lite +4.8, nit-station
+8.9 al límite).

## Medias por agente (6 duelos, suma cero: +0.1 por redondeo)

| agente | bb/100 medio | VPIP | PFR |
|---|---|---|---|
| maniac | +120.3 | 59.5% | 57.8% |
| lag | +91.2 | 32.9% | 25.0% |
| tag | +37.8 | 10.0% | 3.1% |
| nit | +24.9 | 5.4% | 3.1% |
| gto-lite | +17.2 | 4.9% | 2.1% |
| random | -94.7 | 56.0% | 44.2% |
| station | -196.6 | 66.1% | 0.0% |

## Lectura honesta

1. La agresión manda **en esta pool**: station/random pagan de más y maniac/
   lag los despluman (+840 maniac-vs-station, significativo a >20 SE).
   Contra una population tight el orden cambiaría: por eso train≠eval.
2. tag≈nit (+0.8, no significativo): estilos casi idénticos en este espacio.
3. gto-lite solo pierde (marginalmente) con maniac: heurística sólida pero
   documentada como NO-GTO.
4. Self-match tag-vs-tag (n=2000, seed 7): +0.05 bb/100 → suma cero verificada.

---

## CFR preflop HU v2 (2026-10-02, hito V3)

Agente `cfr-preflop` (checkpoint `hu-cfrplus-v2.json`: CFR+ 20k iters,
expl 0.028 en juego abstracto) + fallback tag postflop. Rival: baselines v0
en motor completo (con postflop real). n=3000, seed 7.

| rival | bb/100 | IC95% | veredicto |
|---|---|---|---|
| random | +274.2 | [+183.5, +365.0] | bate, significativo |
| calling-station | +118.4 | [+96.7, +140.2] | bate, significativo |
| nit | +26.6 | [-46.2, +99.4] | no concluyente |
| tag | +42.3 | [-33.7, +118.3] | no concluyente |

Miss-rate 0% vs random/station, 3.2% vs nit/tag (líneas tras el tope de
3 raises van a fallback; documentado, no oculto). Crudos:
`benchmarks/raw/cfr-preflop-vs-*.json`.

Lectura honesta: el aprendizaje es real en el juego abstracto (expl
0.153 → 0.028) y TRANSFIERE contra donantes, pero vs tag/nit la evidencia
es positiva e insuficiente (harían falta ~15k manos para ±40). La estrategia
aprendida casi nunca foldea preflop: es (casi) óptimo SIN postflop con odds
3:1 (el BR lo confirma: 0.014 bb/mano), no intuición transferible al poker
real. Postflop, 6-max y MCCFR quedan fuera de este hito por diseño.
