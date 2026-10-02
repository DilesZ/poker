"use client";

import { useMemo } from "react";
import { buildFeedback } from "../../lib/coach/feedback";
import { calcEquity } from "../../lib/poker/equity";
import { potOdds } from "../../lib/poker/game";
import { toCallFor, usePokerStore } from "../../store/usePokerStore";

/** Coach en vivo: equity rápida (100 iters) vs pot odds. SSR-safe. */
export function CoachFeedback() {
  const game = usePokerStore((s) => s.game);

  const advice = useMemo(() => {
    if (!game) return null;
    const hero = game.players[0];
    if (!hero || hero.hole.length !== 2) return null;
    const toCall = toCallFor(game, 0);
    const price = potOdds(toCall, game.pot);
    const numOpp = Math.max(
      1,
      game.players.filter((p) => p.id !== 0 && !p.folded).length,
    );
    let equity = 0.5;
    try {
      equity = calcEquity(hero.hole, game.board, numOpp, 100);
    } catch {
      equity = 0.5;
    }
    const text = buildFeedback({ street: game.street, pot: game.pot, toCall, equity });
    const good = toCall <= 0 || equity > price;
    return { toCall, price, equity, text, good };
  }, [game]);

  if (!advice) {
    return (
      <section className="poker-panel poker-coach" aria-label="Consejo del coach">
        <h2>Coach en vivo</h2>
        <p className="poker-muted">Inicia una mano para recibir consejo.</p>
      </section>
    );
  }

  return (
    <section className="poker-panel poker-coach" aria-label="Consejo del coach">
      <h2>Coach en vivo</h2>
      <span className={`coach-badge${advice.good ? " good" : " bad"}`}>
        {advice.toCall <= 0 ? "GRATIS" : advice.good ? "+EV · PAGA" : "−EV · FOLD"}
      </span>
      <p>{advice.text}</p>
      <p className="coach-numbers">
        Equity {(advice.equity * 100).toFixed(1)}% · Precio {(advice.price * 100).toFixed(1)}% ·
        Igualar {advice.toCall}
      </p>
    </section>
  );
}
