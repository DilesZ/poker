"use client";
import type { Card as EngineCard, Rank } from "@/lib/poker/types";

/** Etiqueta visible del rango numérico: 2-10, J, Q, K, A. */
export function rankLabel(rank: Rank): string {
  if (rank === 11) return "J";
  if (rank === 12) return "Q";
  if (rank === 13) return "K";
  if (rank === 14) return "A";
  return String(rank);
}

function isRedSuit(suit: EngineCard["suit"]): boolean {
  return suit === "♥" || suit === "♦";
}

export default function Card({
  card,
  faceDown = false,
  small = false,
}: {
  card?: EngineCard;
  faceDown?: boolean;
  small?: boolean;
}) {
  if (faceDown || !card) {
    return (
      <div
        className={`poker-card back${small ? " small" : ""}`}
        aria-label="Carta oculta"
      >
        <span>♠</span>
      </div>
    );
  }
  const red = isRedSuit(card.suit);
  const label = rankLabel(card.rank);
  return (
    <div
      className={`poker-card${small ? " small" : ""}${red ? " red" : ""}`}
      aria-label={`${label} de ${card.suit}`}
    >
      <span className="poker-card-rank">{label}</span>
      <span className="poker-card-suit">{card.suit}</span>
    </div>
  );
}
