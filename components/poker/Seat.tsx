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
  const inicial = (player.isHero ? "T" : (player.name.trim()[0] ?? "?")).toUpperCase();
  const groupLabel = `${player.isHero ? "Hero (tú)" : player.name} — Stack ${player.stack}, apuesta ${player.bet}${player.folded ? ", foldeado" : ""}${highlight ? ", ganador" : ""}`;
  return (
    <div
      className={`poker-seat${player.isHero ? " hero" : ""}${player.folded ? " folded" : ""}${highlight ? " winner" : ""}`}
      style={style}
      role="group"
      aria-label={groupLabel}
    >
      <div className="poker-seat-top">
        <span className="poker-avatar" aria-hidden="true">
          {inicial}
        </span>
        <span className="poker-seat-name">
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
        </span>
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
      <div className="poker-seat-meta">
        <span>
          Stack <strong>{player.stack}</strong>
        </span>
        <span>
          Apuesta <strong>{player.bet}</strong>
        </span>
      </div>
      {player.bet > 0 && (
        <div className="poker-chip">
          <span className="poker-chip-disc" aria-hidden="true" />
          {player.bet}
        </div>
      )}
      {player.folded && (
        <div>
          <span className="poker-status poker-folded">Fold</span>
        </div>
      )}
      {player.allIn && !player.folded && (
        <div>
          <span className="poker-status poker-allin">All-in</span>
        </div>
      )}
      {highlight && (
        <div className="poker-winner" aria-label="Ganador de la mano">
          ★ Ganador
        </div>
      )}
    </div>
  );
}
