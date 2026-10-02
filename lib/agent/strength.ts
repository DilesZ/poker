// Fuerza de cartas CARD-AWARE (v3): heurística ligera sin reglas fijas de acción.
// NO importa lib/training/* ni lib/poker/ai.ts (legado). Solo evaluator.
// La fuerza NUNCA decide sola: es un shape aditivo en chooseBrainAction y un
// bucket en la clave de situación, así el aprendizaje sigue mandando.
import { evaluate7 } from "../poker/evaluator";
import type { Card, Rank, Suit } from "../poker/types";

export type StrengthBucket = "weak" | "mid" | "strong";

/** Bucket de fuerza: <0.4 weak, <0.65 mid, else strong. No-finito → "mid". */
export function bucketFuerza(s: number): StrengthBucket {
  if (!Number.isFinite(s)) return "mid";
  if (s < 0.4) return "weak";
  if (s < 0.65) return "mid";
  return "strong";
}

type HoleBoard =
  | string
  | string[]
  | { rank: unknown; suit: unknown }[]
  | { rank: unknown; suit: unknown }
  | null
  | undefined;

/**
 * Estima fuerza 0-1 tolerante.
 * Acepta "A♠ K♠", "As Ks", arrays de cartas u objetos {rank,suit}.
 * Si no puede parsear (0-1 cartas útiles) devuelve 0.5.
 * Preflop (sin board): par 0.55+rank/14*0.4, suited+0.06, penalización por gap,
 * bonus Ax +0.02. Postflop (5-7 cartas): evaluate7 → 0.12+(cat/8)*0.78.
 */
export function estimateCardStrength(hole: HoleBoard, board?: HoleBoard): number {
  const holeCards = parseCards(hole);
  const boardCards = parseCards(board);
  if (holeCards.length < 2) return 0.5;
  // Preflop: solo hole (board vacío o <3 cartas útiles → heurística).
  const total = [...holeCards, ...boardCards];
  if (boardCards.length === 0 || total.length < 5) {
    // Usa las 2 primeras del hole (si vinieran más, ignora el resto).
    const c1 = holeCards[0] as Card;
    const c2 = holeCards[1] as Card;
    return preflopStrength(c1, c2);
  }
  // Postflop: mejor quinteto de hasta 7 cartas.
  try {
    const mano = total.slice(0, 7);
    const r = evaluate7(mano);
    return limitar(0.12 + (r.category / 8) * 0.78, 0, 1);
  } catch {
    return 0.5;
  }
}

/** Heurística preflop 0-1 (ver cabecera). */
function preflopStrength(c1: Card, c2: Card): number {
  const r1 = c1.rank;
  const r2 = c2.rank;
  const suited = c1.suit === c2.suit;
  if (r1 === r2) {
    // Par: 0.55 + rank/14*0.4 → AA 0.95, 99 ~0.81, 22 ~0.61.
    return limitar(0.55 + (r1 / 14) * 0.4, 0, 0.98);
  }
  const high = Math.max(r1, r2);
  const low = Math.min(r1, r2);
  let s = 0.25 + (high / 14) * 0.35 + (low / 14) * 0.15;
  if (suited) s += 0.06;
  const gap = high - low - 1;
  if (gap >= 4) s -= 0.08;
  else if (gap === 3) s -= 0.05;
  else if (gap === 2) s -= 0.03;
  else if (gap === 1) s -= 0.01;
  // Ax suited/conectado vale un poco más (kicker alto).
  if (high === 14) s += 0.02;
  return limitar(s, 0.05, 0.95);
}

function limitar(x: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, x));
}

/** Normaliza cualquier entrada tolerante a Card[]. Tokens inválidos se ignoran. */
function parseCards(input: HoleBoard): Card[] {
  if (input === null || input === undefined) return [];
  if (typeof input === "string") {
    if (input.trim() === "") return [];
    const tokens = input.trim().split(/[\s,;|]+/).filter(Boolean);
    const out: Card[] = [];
    for (const t of tokens) {
      // Un token podría traer varias cartas pegadas? No: cada token = 1 carta.
      // Pero soporta "AsKs" sin espacio (4 chars, 2 cartas) por tolerancia.
      const pegadas = splitGlued(t);
      for (const p of pegadas) {
        const c = parseSingleCard(p);
        if (c) out.push(c);
      }
    }
    return out;
  }
  if (Array.isArray(input)) {
    const out: Card[] = [];
    for (const el of input) {
      if (typeof el === "string") {
        if (el.trim() === "") continue;
        // El elemento puede ser "A♠" o "A♠ K♠" (con espacio): parte en tokens.
        const tokens = el.trim().split(/[\s,;|]+/).filter(Boolean);
        for (const t of tokens) {
          for (const p of splitGlued(t)) {
            const c = parseSingleCard(p);
            if (c) out.push(c);
          }
        }
      } else if (el !== null && typeof el === "object") {
        const c = parseCardObject(el as { rank: unknown; suit: unknown });
        if (c) out.push(c);
      }
    }
    return out;
  }
  if (typeof input === "object") {
    const c = parseCardObject(input as { rank: unknown; suit: unknown });
    return c ? [c] : [];
  }
  return [];
}

/**
 * Parte tokens pegados tipo "AsKs" (2 cartas sin espacio) en ["As","Ks"].
 * Solo cuando el token tiene pinta de 2 cartas de 2 chars cada una y no
 * parsea como una sola (ej. "10s" no se parte).
 */
function splitGlued(token: string): string[] {
  if (parseSingleCard(token)) return [token];
  // Intento: 4 chars → 2+2 (ej. "AsKs", "A♠K♠" son 4 code units? ♠ es 1 char).
  // Para unicode, trabaja por chars: si len 4 y mitades parsean, parte.
  const chars = [...token];
  if (chars.length === 4) {
    const a = chars.slice(0, 2).join("");
    const b = chars.slice(2, 4).join("");
    if (parseSingleCard(a) && parseSingleCard(b)) return [a, b];
  }
  // Si no se entiende, devuelve el token tal cual (parseSingleCard dará null
  // y el llamador lo ignorará → 0.5 por falta de cartas).
  return [token];
}

/** Parsea una carta aislada ("A♠", "As", "10d", "Td", "9c"). Null si inválida. */
function parseSingleCard(token: string): Card | null {
  const t = token.trim();
  if (t === "") return null;
  const chars = [...t];
  if (chars.length < 2) return null;
  const last = chars[chars.length - 1] as string;
  let suit: Suit | null = null;
  let rankStr: string;
  if (last === "♠" || last === "♥" || last === "♦" || last === "♣") {
    suit = last as Suit;
    rankStr = chars.slice(0, -1).join("").toUpperCase();
  } else {
    const l = last.toUpperCase();
    if (l === "S") suit = "♠";
    else if (l === "H") suit = "♥";
    else if (l === "D") suit = "♦";
    else if (l === "C") suit = "♣";
    else return null;
    rankStr = chars.slice(0, -1).join("").toUpperCase();
  }
  let rank: number | null = null;
  if (rankStr === "A") rank = 14;
  else if (rankStr === "K") rank = 13;
  else if (rankStr === "Q") rank = 12;
  else if (rankStr === "J") rank = 11;
  else if (rankStr === "T" || rankStr === "10") rank = 10;
  else if (/^[2-9]$/.test(rankStr)) rank = Number.parseInt(rankStr, 10);
  else return null;
  if (rank === null || rank < 2 || rank > 14) return null;
  return { rank: rank as Rank, suit };
}

/** Objeto {rank,suit} tolerante: rank 2-14 o "A/K/Q/J/T/10/2-9", suit unicode o letra. */
function parseCardObject(o: { rank: unknown; suit: unknown }): Card | null {
  const { rank, suit } = o;
  let r: number | null = null;
  if (typeof rank === "number" && Number.isInteger(rank) && rank >= 2 && rank <= 14) {
    r = rank;
  } else if (typeof rank === "string") {
    const u = rank.trim().toUpperCase();
    if (u === "A") r = 14;
    else if (u === "K") r = 13;
    else if (u === "Q") r = 12;
    else if (u === "J") r = 11;
    else if (u === "T" || u === "10") r = 10;
    else if (/^[2-9]$/.test(u)) r = Number.parseInt(u, 10);
    else {
      const n = Number.parseInt(u, 10);
      if (Number.isInteger(n) && n >= 2 && n <= 14) r = n;
    }
  } else return null;
  if (r === null) return null;
  let s: Suit | null = null;
  if (typeof suit === "string") {
    const su = suit.trim();
    if (su === "♠" || su === "♥" || su === "♦" || su === "♣") s = su;
    else {
      const l = su.toUpperCase();
      if (l === "S" || l === "SPADES" || l === "♠") s = "♠";
      else if (l === "H" || l === "HEARTS" || l === "♥") s = "♥";
      else if (l === "D" || l === "DIAMONDS" || l === "♦") s = "♦";
      else if (l === "C" || l === "CLUBS" || l === "♣") s = "♣";
    }
  } else return null;
  if (!s) return null;
  return { rank: r as Rank, suit: s };
}
