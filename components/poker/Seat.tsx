"use client";
import type { CSSProperties } from "react";
import type { PlayerState } from "@/lib/poker/types";
import Card from "./Card";

export default function Seat({
  player,
  isDealer,
  showCards,
  highlight = false,
  style,
}: {
  player: PlayerState;
  isDealer: boolean;
  showCards: boolean;
  highlight?: boolean;
  style?: CSSProperties;
}) {
  const visible = player.isHero || showCards;
  return (
    <div
      className={`poker-seat${player.isHero ? " hero" : ""}${player.folded ? " folded" : ""}${highlight ? " winner" : ""}`}
      style={style}
    >
      <div className="poker-seat-name">
        {player.isHero ? "Hero (tú)" : player.name}
        {isDealer && (
          <span className="poker-dealer" title="Botón">
            D
          </span>
        )}
      </div>
      <div className="poker-seat-cards">
        {player.hole.length === 0 || !visible ? (
          <>
            <Card faceDown small />
            <Card faceDown small />
          </>
        ) : (
          player.hole.map((c, i) => (
            <Card key={`${c.rank}${c.suit}-${i}`} card={c} small />
          ))
        )}
      </div>
      <div className="poker-seat-stack">
        Stack {player.stack} · Bet {player.bet}
      </div>
      {player.bet > 0 && <div className="poker-chip">🪙 {player.bet}</div>}
      {player.folded && <div className="poker-folded">Fold</div>}
      {player.allIn && !player.folded && (
        <div className="poker-allin">ALL-IN</div>
      )}
    </div>
  );
}
