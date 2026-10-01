"use client";

import type { GameState } from "../../lib/poker/types";
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

export function PokerTable({ game }: { game: GameState | null }) {
  if (!game) {
    return (
      <div className="poker-felt poker-empty">
        <p>Pulsa «Nueva mano» para repartir.</p>
      </div>
    );
  }
  const reveal = game.street === "showdown" || game.street === "done";
  return (
    <div className="poker-felt" role="table" aria-label="Mesa de poker 6-max">
      <div className="poker-pot">Bote: {game.pot}</div>
      <div className="poker-board">
        {game.board.length === 0 && (
          <span className="poker-street">{game.street}</span>
        )}
        {game.board.map((c, i) => (
          <Card key={`${c.rank}${c.suit}-${i}`} card={c} />
        ))}
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
