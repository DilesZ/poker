// Flujo de mano Texas Hold'em: blinds, reparto, calles, side pots y showdown.
import { drawMany, newDeck, shuffle } from "./deck";
import { CATEGORY_NAMES, compareRanks, evaluate7 } from "./evaluator";
import type { GameState, PlayerState, SidePot } from "./types";

/** Crea mano nueva: 6 jugadores, stacks 1000, blinds 10/20 por defecto. */
export function newHand(
  numPlayers = 6,
  startingStack = 1000,
  smallBlind = 10,
  bigBlind = 20,
  button = 0,
): GameState {
  if (numPlayers < 2 || numPlayers > 10) throw new Error("numPlayers debe ser 2-10");
  const players: PlayerState[] = Array.from({ length: numPlayers }, (_, i) => ({
    id: i,
    name: i === 0 ? "Hero" : `Villain ${i}`,
    stack: startingStack,
    bet: 0,
    folded: false,
    allIn: false,
    hole: [],
    isHero: i === 0,
  }));
  return {
    players,
    button: ((button % numPlayers) + numPlayers) % numPlayers,
    smallBlind,
    bigBlind,
    street: "preflop",
    board: [],
    deck: shuffle(newDeck()),
    pot: 0,
    sidePots: [],
    currentBet: 0,
  };
}

/** Pone una ciega (con all-in si stack insuficiente). */
function postBlind(p: PlayerState, amount: number): void {
  const pay = Math.min(p.stack, amount);
  p.stack -= pay;
  p.bet += pay;
  if (p.stack === 0) p.allIn = true;
}

/** Cobra SB (button+1) y BB (button+2). Fija currentBet al BB. */
export function postBlinds(state: GameState): void {
  const n = state.players.length;
  const sb = state.players[(state.button + 1) % n] as PlayerState;
  const bb = state.players[(state.button + 2) % n] as PlayerState;
  postBlind(sb, state.smallBlind);
  postBlind(bb, state.bigBlind);
  state.currentBet = state.bigBlind;
  refreshPot(state);
}

/** Reparte 2 cartas a cada jugador (sin quemar, preflop). */
export function deal(state: GameState): void {
  for (let round = 0; round < 2; round++) {
    for (const p of state.players) {
      const c = state.deck.pop();
      if (c) p.hole.push(c);
    }
  }
}

/** Quema 1 carta (regla Texas). */
function burn(state: GameState): void {
  state.deck.pop();
}

/** Avanza calle: flop (3) → turn (1) → river (1) → showdown. */
export function advanceStreet(state: GameState): void {
  burn(state);
  if (state.street === "preflop") {
    state.board.push(...drawMany(state.deck, 3));
    state.street = "flop";
  } else if (state.street === "flop") {
    state.board.push(...drawMany(state.deck, 1));
    state.street = "turn";
  } else if (state.street === "turn") {
    state.board.push(...drawMany(state.deck, 1));
    state.street = "river";
  } else if (state.street === "river") {
    state.street = "showdown";
  }
  state.currentBet = 0; // simplificación: sin apuestas entre calles
}

/** Recalcula pot total desde apuestas. */
export function refreshPot(state: GameState): void {
  state.pot = state.players.reduce((s, p) => s + p.bet, 0);
}

/** Construye botes laterales por niveles de apuesta (all-ins). */
export function buildSidePots(players: PlayerState[]): SidePot[] {
  const levels = [...new Set(players.filter((p) => p.bet > 0).map((p) => p.bet))].sort(
    (a, b) => a - b,
  );
  const pots: SidePot[] = [];
  let prev = 0;
  for (const level of levels) {
    let amount = 0;
    const eligible: number[] = [];
    for (const p of players) {
      if (p.bet >= level) {
        amount += level - prev;
        if (!p.folded) eligible.push(p.id);
      }
    }
    if (amount > 0 && eligible.length > 0) pots.push({ amount, eligible });
    prev = level;
  }
  return pots;
}

/** Resultado del showdown por bote. */
export interface ShowdownResult {
  potIndex: number;
  amount: number;
  winnerIds: number[];
  /** Mejor categoría ganadora (0-8), para UI/logs. */
  category: number;
}

/** Resuelve showdown con evaluator, reparte botes y marca winners. */
export function showdown(state: GameState): ShowdownResult[] {
  state.sidePots = buildSidePots(state.players);
  refreshPot(state);
  state.street = "showdown";
  const results: ShowdownResult[] = [];
  const winners = new Set<number>();

  state.sidePots.forEach((pot, potIndex) => {
    const contenders = state.players.filter(
      (p) => pot.eligible.includes(p.id) && !p.folded && p.hole.length === 2,
    );
    if (contenders.length === 0) return;
    // Mejor rank por contendiente (hole + board).
    const ranked = contenders.map((p) => ({
      p,
      r: evaluate7([...p.hole, ...state.board]),
    }));
    let best = ranked[0]?.r;
    for (const { r } of ranked) if (best && compareRanks(r, best) > 0) best = r;
    const win = ranked.filter(({ r }) => best && compareRanks(r, best) === 0);
    // Split equitativo; resto (fichas impares) al primer ganador por posición.
    const share = Math.floor(pot.amount / win.length);
    let rest = pot.amount - share * win.length;
    for (const { p } of win) {
      p.stack += share + (rest > 0 ? 1 : 0);
      if (rest > 0) rest--;
      winners.add(p.id);
    }
    results.push({
      potIndex,
      amount: pot.amount,
      winnerIds: win.map(({ p }) => p.id),
      category: best?.category ?? 0,
    });
  });

  state.winners = [...winners];
  state.street = "done";
  return results;
}

/** Nombre legible de la categoría 0-8 (para UI/logs). Ej. 8 → "straight flush". */
export function handName(category: number): string {
  if (!Number.isInteger(category) || category < 0 || category > 8) return "unknown";
  return CATEGORY_NAMES[category] as string;
}

/** Pot odds: proporción a igualar (0-1). Ej. toCall 20 en pot 80 → 0.2. */
export function potOdds(toCall: number, pot: number): number {
  if (toCall <= 0) return 0;
  if (pot < 0) throw new Error("pot no puede ser negativo");
  return toCall / (pot + toCall);
}
