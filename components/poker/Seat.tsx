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
  const groupLabel = `${player.isHero ? "Hero (tú)" : player.name} — Stack ${player.stack}, apuesta ${player.bet}${player.folded ? ", foldeado" : ""}${highlight ? ", ganador" : ""}`;
  return (
    <div
      className={`poker-seat${player.isHero ? " hero" : ""}${player.folded ? " folded" : ""}${highlight ? " winner" : ""}`}
      style={style}
      role="group"
      aria-label={groupLabel}
    >
      <div className="poker-seat-name">
        {player.isHero ? "Hero (tú)" : player.name}
        {isDealer && (
          <span
            className="poker-dealer"
            title="Botón dealer"
            aria-label="Botón dealer"
          >
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
      {highlight && (
        <div className="poker-winner" aria-label="Ganador de la mano">
          🏆 Ganador
        </div>
      )}
    </div>
  );
}
