"use client";

import { calcRacha, calcVPIP, calcWinrate } from "../../lib/stats";
import { usePokerStore } from "../../store/usePokerStore";

export function HudBankroll() {
  const game = usePokerStore((s) => s.game);
  const stats = usePokerStore((s) => s.stats);
  const lastResult = usePokerStore((s) => s.lastResult);
  const resetStats = usePokerStore((s) => s.resetStats);

  const hero = game?.players[0] ?? null;
  const winrate = calcWinrate(stats.resultados);
  const racha = calcRacha(stats.resultados);
  const vpip = calcVPIP(stats.vpipCount, stats.manosTotales);

  function handleReset() {
    if (typeof window !== "undefined") {
      if (!window.confirm("¿Reiniciar estadísticas?")) return;
    }
    resetStats();
  }

  return (
    <section className="poker-panel poker-hud" aria-label="HUD y bankroll">
      <h2>HUD · Bankroll</h2>
      <dl>
        <dt>Stack Hero</dt>
        <dd>{hero?.stack ?? "—"}</dd>
        <dt>Bote</dt>
        <dd>{game?.pot ?? "—"}</dd>
        <dt>Calle</dt>
        <dd>{game?.street ?? "—"}</dd>
        <dt title="Porcentaje de manos ganadas sobre el total jugado">
          Winrate
        </dt>
        <dd title="Porcentaje de manos ganadas sobre el total jugado">
          {winrate}%
        </dd>
        <dt>Manos</dt>
        <dd>{stats.manosTotales}</dd>
        <dt title="Racha actual de victorias o derrotas consecutivas">
          Racha
        </dt>
        <dd title="Racha actual de victorias o derrotas consecutivas">
          {racha.tipo ? `${racha.tipo} ×${racha.count}` : "—"}
        </dd>
        <dt title="Voluntarily Put money In Pot: % de manos donde pagas voluntariamente más allá de la ciega">
          VPIP
        </dt>
        <dd title="Voluntarily Put money In Pot: % de manos donde pagas voluntariamente más allá de la ciega">
          {vpip}%
        </dd>
        <dt>Última mano</dt>
        <dd>{lastResult ?? "—"}</dd>
      </dl>
      <button
        type="button"
        className="btn-ps btn-small"
        onClick={handleReset}
      >
        Reiniciar stats
      </button>
    </section>
  );
}
