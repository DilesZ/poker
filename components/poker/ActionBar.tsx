"use client";

import { potOdds } from "../../lib/poker/game";
import { toCallFor, usePokerStore } from "../../store/usePokerStore";

export function ActionBar() {
  const game = usePokerStore((s) => s.game);
  const raiseAmount = usePokerStore((s) => s.raiseAmount);
  const setRaiseAmount = usePokerStore((s) => s.setRaiseAmount);
  const startHand = usePokerStore((s) => s.startHand);
  const heroFold = usePokerStore((s) => s.heroFold);
  const heroCallOrCheck = usePokerStore((s) => s.heroCallOrCheck);
  const heroBet = usePokerStore((s) => s.heroBet);
  const nextStreet = usePokerStore((s) => s.nextStreet);

  const hero = game?.players[0] ?? null;
  const toCall = game && hero ? toCallFor(game, 0) : 0;
  const canAct =
    !!game &&
    !!hero &&
    !hero.folded &&
    !hero.allIn &&
    game.street !== "done";
  const canAdvance =
    !!game && !!hero && !hero.folded && game.street !== "done";
  const odds = game ? potOdds(toCall, game.pot) : 0;

  return (
    <div className="poker-actionbar">
      <button
        type="button"
        className="btn-ps btn-fold"
        disabled={!canAct}
        onClick={heroFold}
      >
        Fold
      </button>
      <button
        type="button"
        className="btn-ps btn-call"
        disabled={!canAct}
        onClick={heroCallOrCheck}
      >
        {toCall > 0 ? `Call ${toCall}` : "Check"}
      </button>
      <input
        type="number"
        className="poker-raise-input"
        aria-label="Cantidad a subir"
        min={1}
        value={raiseAmount}
        disabled={!canAct}
        onChange={(e) => setRaiseAmount(Number(e.target.value))}
      />
      <button
        type="button"
        className="btn-ps btn-raise"
        disabled={!canAct}
        onClick={heroBet}
      >
        Raise
      </button>
      <button
        type="button"
        className="btn-ps"
        disabled={!canAdvance}
        onClick={nextStreet}
      >
        {game?.street === "river" ? "Showdown" : "Siguiente calle"}
      </button>
      <button type="button" className="btn-ps btn-new" onClick={startHand}>
        Nueva mano
      </button>
      {game && (
        <span className="poker-odds">
          Pot odds: {(odds * 100).toFixed(1)}% · Bote {game.pot} · A igualar{" "}
          {toCall}
        </span>
      )}
    </div>
  );
}
