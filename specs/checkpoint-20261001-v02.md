# Checkpoint v0.2 — 2026-10-01 — Self-play + SNG

Commit: e7b381a en DilesZ/poker main. Vercel auto-deploy desde main.

Qué se subió:
- lib/training/: strategy.ts (v1 versionada), selfplay.ts (runSelfPlay seeded, regret lr 0.05), experience.ts (cap 500 localStorage), 3 tests.
- lib/tournament/: blinds.ts (7 niveles, ante desde nivel 4), structure.ts (payouts 65/35), sng.ts, 4 tests.
- store/useTournamentStore.ts (persist poker-sng), components/training/SelfPlayPanel, components/tournament/TournamentBar, app/entrenar/page.
- Verificado: typecheck 0 errores, vitest 15/15 (8 evaluator + 4 tournament + 3 selfplay), next build 4 rutas (/, /entrenar, /_not-found, /api/health).

Límites honestos: v0.2 aprende push/fold <10bb + rangos + sizing 33/50/75 por regret tabular. NO es GTO (requeriría CFR + millones de manos). Solo self-play local, sin dinero real, sin bots a salas externas.

Vercel: importar DilesZ/poker ya conectado; comprobar /entrenar en poker-flax-seven.vercel.app tras deploy e7b381a.

Siguiente: ELO interno checkpoint-vs-previa, coach explicativo mano a mano, e2e Playwright.
