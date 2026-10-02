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

function suitEs(suit: EngineCard["suit"]): string {
  if (suit === "♠") return "picas";
  if (suit === "♥") return "corazones";
  if (suit === "♦") return "diamantes";
  return "tréboles";
}

function rankEs(rank: Rank): string {
  if (rank === 11) return "Jota";
  if (rank === 12) return "Reina";
  if (rank === 13) return "Rey";
  if (rank === 14) return "As";
  return String(rank);
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
        <span className="poker-card-back-emblem" aria-hidden="true">
          ♠
        </span>
      </div>
    );
  }
  const red = isRedSuit(card.suit);
  const label = rankLabel(card.rank);
  return (
    <div
      className={`poker-card${small ? " small" : ""}${red ? " red" : ""}`}
      aria-label={`${rankEs(card.rank)} de ${suitEs(card.suit)}`}
    >
      <span className="poker-card-corner tl" aria-hidden="true">
        <span>{label}</span>
        <span>{card.suit}</span>
      </span>
      <span className="poker-card-rank">{label}</span>
      <span className="poker-card-suit">{card.suit}</span>
      <span className="poker-card-corner br" aria-hidden="true">
        <span>{label}</span>
        <span>{card.suit}</span>
      </span>
    </div>
  );
}
