// Conjuntos de información (infosets) para CFR/abstracción — vista del héroe.
// Sin dependencias. No incluye hole ajenas ni deck (información imperfecta).
import type { Card } from "@/lib/poker/types";
import type { EngineStreet, LegalActions, PokerState } from "./types";
import { getLegalActions, toCall } from "./betting";

/** Etiqueta de posición (6-max; en short-handed se compacta sin MP). */
export type PositionLabel = "SB" | "BB" | "UTG" | "MP" | "CO" | "BTN";

/** Vista pública del héroe + sus 2 cartas (nunca hole ajenas ni deck). */
export interface InformationSet {
  street: EngineStreet;
  heroSeat: number;
  buttonSeat: number;
  position: PositionLabel;
  numActive: number;
  hole: [Card, Card];
  board: Card[];
  pot: number;
  stacks: number[];
  betsStreet: number[];
  betsHand: number[];
  toCall: number;
  minRaiseTo: number;
  stackHero: number;
  effectiveStack: number;
  lastAggressor: number | null;
  actingSeat: number | null;
  bettingHistory: string[];
  legal: LegalActions;
  handId: string;
  seed: number;
}

/**
 * Posición del asiento respecto al botón (circular por índice del array).
 * - HU (2j): botón → SB, otro → BB.
 * - 6-max: +1 SB, +2 BB, +3 UTG, +4 MP, +5 CO, +0 BTN.
 * - 3-5j: los existentes en orden SB, BB, UTG, CO y BTN (sin MP).
 * - 7+j: +1 SB, +2 BB, +3 UTG, último antes del botón CO, resto MP.
 */
export function positionOf(state: PokerState, seat: number): PositionLabel {
  const n = state.players.length;
  const si = state.players.findIndex((p) => p.seat === seat);
  if (si === -1) throw new Error(`Asiento inexistente para posición: ${seat}.`);
  if (n === 2) return seat === state.button ? "SB" : "BB";
  const bi = state.players.findIndex((p) => p.seat === state.button);
  const base = bi === -1 ? 0 : bi;
  const offset = (((si - base) % n) + n) % n;
  if (offset === 0) return "BTN";
  if (n >= 6) {
    if (offset === 1) return "SB";
    if (offset === 2) return "BB";
    if (offset === 3) return "UTG";
    if (offset === n - 1) return "CO";
    return "MP";
  }
  const seq: PositionLabel[] = ["SB", "BB", "UTG", "CO"];
  const pos = seq[offset - 1];
  if (!pos) throw new Error(`Offset de posición inválido (${offset}) con ${n} jugadores.`);
  return pos;
}

/**
 * Vista del héroe. Lanza si no tiene exactamente 2 hole.
 * Copia hole/board/historial (no aliasa arrays del estado).
 */
export function getInformationSet(state: PokerState, heroSeat: number): InformationSet {
  const heroe = state.players.find((p) => p.seat === heroSeat);
  if (!heroe) throw new Error(`Héroe inexistente: asiento ${heroSeat}.`);
  if (heroe.hole.length !== 2) {
    throw new Error(`El héroe (asiento ${heroSeat}) no tiene 2 hole (tiene ${heroe.hole.length}).`);
  }
  const hole: [Card, Card] = [{ ...heroe.hole[0]! }, { ...heroe.hole[1]! }];
  const board: Card[] = state.board.map((c) => ({ ...c }));
  const stacks: number[] = state.players.map((p) => p.stack);
  const betsStreet: number[] = state.players.map((p) => p.betStreet);
  const betsHand: number[] = state.players.map((p) => p.betHand);
  const numActive = state.players.filter((p) => !p.folded).length;
  const stackHero = heroe.stack;
  const rivalesActivos = state.players.filter((p) => p.seat !== heroSeat && !p.folded);
  const maxRival =
    rivalesActivos.length > 0 ? Math.max(...rivalesActivos.map((p) => p.stack)) : stackHero;
  const effectiveStack = Math.min(stackHero, maxRival);
  return {
    street: state.street,
    heroSeat,
    buttonSeat: state.button,
    position: positionOf(state, heroSeat),
    numActive,
    hole,
    board,
    pot: state.pot,
    stacks,
    betsStreet,
    betsHand,
    toCall: toCall(state, heroSeat),
    minRaiseTo: Math.min(state.currentBet + state.minRaise, heroe.betStreet + heroe.stack),
    stackHero,
    effectiveStack,
    lastAggressor: state.lastAggressor,
    actingSeat: state.actingSeat,
    bettingHistory: [...(state.history ?? [])],
    legal: getLegalActions(state, heroSeat),
    handId: state.handId,
    seed: state.seed,
  };
}

// ---------------------------------------------------------------------------
// Clave determinista y compacta
// ---------------------------------------------------------------------------

/** Rango numérico → letra (23456789TJQKA). */
function rangoChar(rank: number): string {
  if (rank >= 2 && rank <= 9) return String(rank);
  if (rank === 10) return "T";
  if (rank === 11) return "J";
  if (rank === 12) return "Q";
  if (rank === 13) return "K";
  if (rank === 14) return "A";
  throw new Error(`Rango inválido para clave: ${rank}.`);
}

/** Palo → letra shdc (acepta símbolo francés o letra). */
function paloChar(suit: string): string {
  if (suit === "♠" || suit === "s" || suit === "S") return "s";
  if (suit === "♥" || suit === "h" || suit === "H") return "h";
  if (suit === "♦" || suit === "d" || suit === "D") return "d";
  if (suit === "♣" || suit === "c" || suit === "C") return "c";
  throw new Error(`Palo inválido para clave: ${suit}.`);
}

/** Orden canónico de palo para desempates (s<h<d<c). */
function ordenPalo(suit: string): number {
  const c = paloChar(suit);
  if (c === "s") return 0;
  if (c === "h") return 1;
  if (c === "d") return 2;
  return 3;
}

/** Una carta como "Ah" (rango + palo shdc). */
function cartaStr(c: Card): string {
  return `${rangoChar(c.rank)}${paloChar(c.suit)}`;
}

/** Hole canónico: mayor rango primero (parejas desempatan por palo). */
function holeStr(hole: [Card, Card]): string {
  const [a, b] = [...hole].sort((x, y) => y.rank - x.rank || ordenPalo(x.suit) - ordenPalo(y.suit));
  return `${cartaStr(a!)}${cartaStr(b!)}`;
}

/**
 * Board explícito en orden repartido + textura: "-r" rainbow (todos los
 * palos distintos), "-f" en otro caso (proyecto de color posible).
 * Board vacío (preflop) → "-".
 */
function boardStr(board: Card[]): string {
  if (board.length === 0) return "-";
  const cartas = board.map(cartaStr).join("");
  const distintos = new Set(board.map((c) => paloChar(c.suit)));
  const nDistintos = [...distintos].length;
  return `${cartas}${nDistintos === board.length ? "-r" : "-f"}`;
}

/**
 * Clave determinista y compacta (sin hole ajenas ni deck por construcción).
 * Formato: `hole|board|POS|street|p{pot}|s{stackHero}e{effective}|tc{toCall}|mr{minRaiseTo}|a{numActive}|h:{historial,}`
 * Ej: `AhKs|Kc7h2d-r|BTN|flop|p120|s990e800|tc20|mr60|a3|h:x,c20,/flop`
 */
export function getInformationSetKey(info: InformationSet): string {
  const historial = info.bettingHistory.join(",");
  return (
    `${holeStr(info.hole)}|${boardStr(info.board)}|${info.position}|${info.street}` +
    `|p${info.pot}|s${info.stackHero}e${info.effectiveStack}` +
    `|tc${info.toCall}|mr${info.minRaiseTo}|a${info.numActive}|h:${historial}`
  );
}
