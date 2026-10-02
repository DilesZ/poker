# AI Roadmap — laboratorio de agentes de Texas Hold'em 6-max

> Estado: auditoría P0 completada (2026-10-02). Motor P1 (`lib/engine/`) implementado.
> Regla de honestidad: HEURISTIC ≠ CFR ≠ GTO. Nada se llama "aprendizaje" sin
> métrica, ni "mejor" sin intervalo de confianza, ni "GTO" sin exploitability.

## CURRENT STATE

**App educativa funcional** (Next.js 16 + Vercel + Upstash KV):
mesa 6-max local, salas privadas 1v1/multi con agente online, coach, estrategias,
SNG demo, `/entrenar`, diario del agente.

**Tres sistemas de "aprendizaje" inconexos, ninguno es CFR:**
1. `lib/training/selfplay.ts` — `w[idx] += 0.05·clamp(reward/20)` sobre 169
   clases de mano + `deriveStrategy` (±0.02 a tightness/aggression por
   winrate). Ajuste cosmético tabular; **sin `regretSum`/`strategySum`**.
   `@legacy` desde P1 (la UI `/entrenar` lo sigue usando hasta que el lab lo
   sustituya). Su botón "Aplicar a IA mesa" no tiene efecto: `store/` jamás
   importa `loadStrategy` (verificado por grep).
2. `lib/agent/brain.ts` — ε-greedy tabular honesto (40 priors `calle×cubo×acción`,
   ε 0.9→0.1, +0.05/−0.04). Aprende de verdad, pero sin contrafactuales ni
   garantía de convergencia. Sin fugas: solo ve `BrainContext` público.
3. `lib/poker/ai.ts` — heurística fija (bet 50-75% pot, 15% random, push/fold
   <10bb). No aprende.

**Motor P1** (`lib/engine/`, nuevo en este roadmap): `PokerState` inmutable,
`BettingEngine` (`applyAction`, `getLegalActions`, min-raise, short-raise sin
reapertura, orden UTG/button-last con HU `SB=button`), `settle`
(side pots + `refundUncalled`, odd-chip a la izquierda del button),
`createRng(seed)` como única aleatoriedad. Invariante: `pot == ΣbetHand`,
`Σstack + pot == total`. 26 tests (incl. 20 manos aleatorias completas con
conservación). `lib/poker/game.ts` queda congelado como legado de la UI
hasta la migración de salas/mesa.

## TARGET STATE

```
UI/Coach (/entrenar lab) ── Decision Interface ── Game Engine (lib/engine)
        ┌──────────────┼───────────────┐
  HeuristicAgent   CFRAgent(tabular)   NeuralAgent(futuro)
   (ai.ts, salas)   regretSum/          (Deep CFR, último)
                    strategySum
                          │
                   Evaluation Engine (baselines + IC95% + matrices)
                          │
            train-population ≠ eval-population · exploitability
                          │
                   Training Loop (npm run train + Worker)
                          │
                   Checkpoints / experiments/
```

Flujo objetivo:
`npm run train -- --algorithm cfr+ --iterations 10000 --seed 12345` →
checkpoints versionados → `npm run evaluate` → matriz bb/100 + IC95% →
jugar/comparar/repetir desde la app.

## GAPS (auditoría 2026-10-02)

- Motor: SIN máquina de apuestas en `lib/poker` (resuelto en P1 con
  `lib/engine/`); HU roto, sin refund, odd-chip mal asignado, `deal` a
  foldeados, `draw` silencioso (todo documentado, legado congelado).
- Ausente (grep: 0 resultados): `PokerState` canónico (→P1), `InformationSet`
  + key (→P2), `ActionAbstractionConfig` (→P2), `regretMatching`/`strategySum`
  (→P4), baselines congelados (→P3), `calculateEquity`, rangos `getRange`,
  populations separadas, checkpoints con hash, experiment tracking,
  `npm run train/evaluate`, Web Workers, curvas, replay con EV, tests de
  no-leakage y property-based.
- Deuda: README contradictorio (roadmap hecho marcado pendiente, `Env None`
  vs KV, `npm test (8 tests)` vs 84); `specs/spec.md` mezcla v0.1-v0.3 sin
  ADRs (se adopta formato spec-por-fase desde aquí).

## RISKS

1. Entrenar sobre motor incorrecto → mitigado: P1 primero, property tests.
2. Overfit al self-play (derrotar solo a su propia versión) → populations
   train≠eval obligatorias (P6).
3. Varianza enmascarada de aprendizaje → IC95% + n siempre (P3 antes que P4).
4. Leakage (hole ajenas/deck futuro en la decisión) → test negativo desde P2.
5. Coste Deep CFR sin base tabular → prohibido antes de P1-P5 verdes.
6. Falsa sensación de aprendizaje → gate de Kuhn/Leduc: si CFR no converge
   ahí (exploitability→0), prohibido pasar a Hold'em.

## ARCHITECTURE

Ver `docs/architecture.md` (mapa UI→persistence, responsabilidades,
acoplamientos, duplicaciones, código crítico, qué no tocar).

## PHASES

| Fase | Entregable | Estado |
|---|---|---|
| P0 | Auditoría + este roadmap + `architecture.md` | Hecho |
| P1 | Motor `lib/engine/` + 26 tests | Hecho (84/84) |
| P2 | Infosets + `ActionAbstractionConfig` + test no-leakage | Siguiente |
| P3 | 7 baselines congelados + `evaluateAgent` + `npm run evaluate` + matriz base | — |
| P4/P5 | CFR → CFR+ validado en Kuhn/Leduc, luego Hold'em | — |
| P6+ | Population, trainer CLI, UI lab, equity/rangos, exploitability, coach | En orden |
| Deep CFR | Solo con P1-P5 verdes | Último |

## ESTIMATED COMPLEXITY

P2: M · P3: M (alto valor inmediato) · P4/P5: L (núcleo) · P6+: M-L c/u ·
Deep CFR: XL.

## TEST STRATEGY

Unitarios motor → golden Kuhn/Leduc (exploitability→0) → property-based
(fichas, probs suman 1, `regret+ ≥ 0`, foldeado no actúa, acción ilegal
imposible) → benchmark con seeds fijas. Cada bug → un test.

## BENCHMARK STRATEGY

Matriz todos-contra-todos en `docs/benchmarks.md`: bb/100 + SD + IC95% + n
+ VPIP/PFR/3bet/WTSD/W$SD/agresión/distribución. Baselines congelados como
referencia eterna. Prohibido declarar "v2 mejor" sin significancia.
