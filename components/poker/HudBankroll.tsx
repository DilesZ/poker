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

  const resultClass =
    lastResult === "V" ? "win" : lastResult === "D" ? "lose" : lastResult === "E" ? "draw" : "";
  const resultLabel =
    lastResult === "V" ? "Victoria" : lastResult === "D" ? "Derrota" : lastResult === "E" ? "Empate" : "—";

  return (
    <section className="poker-panel poker-hud" aria-label="HUD y bankroll">
      <h2>HUD · Bankroll</h2>
      <dl>
        <div>
          <dt>Stack Hero</dt>
          <dd>{hero?.stack ?? "—"}</dd>
        </div>
        <div>
          <dt>Bote</dt>
          <dd>{game?.pot ?? "—"}</dd>
        </div>
        <div>
          <dt>Winrate</dt>
          <dd title="Porcentaje de manos ganadas sobre el total jugado">
            {winrate}%
          </dd>
        </div>
        <div>
          <dt>Manos</dt>
          <dd>{stats.manosTotales}</dd>
        </div>
        <div>
          <dt>Racha</dt>
          <dd title="Racha actual de victorias o derrotas consecutivas">
            {racha.tipo ? `${racha.tipo} ×${racha.count}` : "—"}
          </dd>
        </div>
        <div>
          <dt>VPIP</dt>
          <dd title="Voluntarily Put money In Pot: % de manos donde pagas voluntariamente más allá de la ciega">
            {vpip}%
          </dd>
        </div>
      </dl>
      <div className="train-actions">
        <span className={`result-badge${resultClass ? ` ${resultClass}` : ""}`}>
          Última mano: {resultLabel}
        </span>
        <button
          type="button"
          className="btn-ps btn-small"
          onClick={handleReset}
        >
          Reiniciar stats
        </button>
      </div>
    </section>
  );
}
