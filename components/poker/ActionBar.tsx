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
  const pot = game?.pot ?? 0;
  const heroStack = hero?.stack ?? 0;
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
        Retirarse (Fold)
      </button>
      <button
        type="button"
        className="btn-ps btn-call"
        disabled={!canAct}
        onClick={heroCallOrCheck}
      >
        {toCall > 0 ? `Igualar (Call) ${toCall}` : "Pasar (Check)"}
      </button>
      <label className="poker-raise-label" htmlFor="raise-amount">
        Subir (Raise)
      </label>
      <input
        id="raise-amount"
        type="number"
        className="poker-raise-input"
        aria-label="Cantidad a subir"
        min={1}
        max={heroStack}
        step={10}
        value={raiseAmount}
        disabled={!canAct}
        onChange={(e) => setRaiseAmount(Number(e.target.value))}
      />
      <span className="poker-quick">
        <button
          type="button"
          className="btn-ps btn-small"
          disabled={!canAct}
          onClick={() => setRaiseAmount(Math.floor(pot / 2))}
          title="Apostar medio bote"
        >
          ½ Pot
        </button>
        <button
          type="button"
          className="btn-ps btn-small"
          disabled={!canAct}
          onClick={() => setRaiseAmount(pot)}
          title="Apostar el bote completo"
        >
          Pot
        </button>
        <button
          type="button"
          className="btn-ps btn-small"
          disabled={!canAct}
          onClick={() => setRaiseAmount(heroStack)}
          title="Apostar todo el stack"
        >
          All-in
        </button>
      </span>
      <button
        type="button"
        className="btn-ps btn-raise"
        disabled={!canAct}
        onClick={heroBet}
      >
        Subir (Raise)
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
        <span className="poker-odds" aria-live="polite">
          Pot odds: {(odds * 100).toFixed(1)}% · Bote {game.pot} · A igualar{" "}
          {toCall}
        </span>
      )}
    </div>
  );
}
