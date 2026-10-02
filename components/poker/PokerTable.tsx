"use client";

import type { GameState } from "../../lib/poker/types";
import { usePokerStore } from "../../store/usePokerStore";
import Card from "./Card";
import Seat from "./Seat";

// Posiciones 6-max alrededor del óvalo (top/left en %).
const SEAT_POS: Array<{ top: string; left: string }> = [
  { top: "86%", left: "50%" }, // Hero abajo
  { top: "66%", left: "13%" },
  { top: "28%", left: "13%" },
  { top: "12%", left: "50%" },
  { top: "28%", left: "87%" },
  { top: "66%", left: "87%" },
];

const STREET_ES: Record<string, string> = {
  preflop: "Pre-flop",
  flop: "Flop",
  turn: "Turn",
  river: "River",
  showdown: "Showdown",
  done: "Showdown",
};

export function PokerTable({ game }: { game: GameState | null }) {
  const startHand = usePokerStore((s) => s.startHand);

  if (!game) {
    return (
      <div className="poker-felt poker-empty" role="status">
        <p>Pulsa «Nueva mano» para repartir.</p>
        <button
          type="button"
          className="btn-ps btn-new"
          onClick={startHand}
        >
          Nueva mano
        </button>
      </div>
    );
  }
  const reveal = game.street === "showdown" || game.street === "done";
  const streetEs = STREET_ES[game.street] ?? game.street;
  const missing = Math.max(0, 5 - game.board.length);
  const potLabel = game.pot.toLocaleString("es");
  return (
    <div
      className="poker-felt"
      role="region"
      aria-label="Mesa de poker 6-max"
    >
      <div className="poker-pot" aria-label={`Bote ${game.pot} fichas`}>
        Bote: {potLabel}
      </div>
      <div className="poker-board">
        {game.board.length === 0 && (
          <span className="poker-street">{streetEs}</span>
        )}
        {game.board.map((c, i) => (
          <Card key={`${c.rank}${c.suit}-${i}`} card={c} />
        ))}
        {game.board.length === 0
          ? Array.from({ length: 5 }).map((_, i) => (
              <div
                key={`ph-${i}`}
                className="poker-card placeholder"
                aria-hidden="true"
              >
                <span>··</span>
              </div>
            ))
          : null}
        {game.board.length > 0 && game.board.length < 5
          ? Array.from({ length: missing }).map((_, i) => (
              <div
                key={`ph-${i}`}
                className="poker-card placeholder"
                aria-hidden="true"
              >
                <span>··</span>
              </div>
            ))
          : null}
        {game.board.length > 0 && (
          <span className="poker-street">{streetEs}</span>
        )}
      </div>
      {game.players.map((p) => {
        const pos = SEAT_POS[p.id % SEAT_POS.length] ?? {
          top: "50%",
          left: "50%",
        };
        return (
          <Seat
            key={p.id}
            player={p}
            isDealer={game.button === p.id}
            showCards={reveal}
            highlight={game.winners?.includes(p.id) ?? false}
            style={{ top: pos.top, left: pos.left }}
          />
        );
      })}
    </div>
  );
}
