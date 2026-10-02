// Estado inicial del motor: creación de mano, ciegas y reparto. Inmutable.
import { newDeck } from "@/lib/poker/deck";
import { createRng, shuffleWith } from "./rng";
import type { EnginePlayer, PokerState } from "./types";

/** Opciones para crear una mano nueva. */
export interface NewEngineHandOpts {
  numPlayers: number;
  startingStack: number;
  sb: number;
  bb: number;
  ante?: number;
  button: number;
  handId: string;
  seed: number;
  names?: string[];
}

/** Normaliza un asiento al rango [0, n). */
function modSeat(seat: number, n: number): number {
  return ((seat % n) + n) % n;
}

/** Busca el jugador por asiento (lanza si no existe). */
function playerBySeat(players: EnginePlayer[], seat: number): EnginePlayer {
  const p: EnginePlayer | undefined = players.find((x) => x.seat === seat);
  if (!p) throw new Error(`Asiento inexistente: ${seat}`);
  return p;
}

/**
 * Crea una mano nueva con mazo barajado mediante RNG sembrado.
 * Calles en preflop, bote a 0 y sin turno asignado (actingSeat null).
 */
export function newEngineHand(opts: NewEngineHandOpts): PokerState {
  const n: number = opts.numPlayers;
  if (!Number.isInteger(n) || n < 2) throw new Error("numPlayers debe ser >= 2");
  if (opts.startingStack <= 0) throw new Error("startingStack debe ser > 0");
  if (opts.sb <= 0 || opts.bb <= 0) throw new Error("sb/bb deben ser > 0");

  const ante: number = opts.ante ?? 0;
  // Mazo barajado de forma determinista con la semilla (sin Math.random).
  const rng: () => number = createRng(opts.seed);
  const deck = shuffleWith(newDeck(), rng);

  // Jugadores con stack inicial y sin cartas.
  const players: EnginePlayer[] = [];
  for (let i: number = 0; i < n; i++) {
    const name: string = opts.names?.[i] ?? `P${i + 1}`;
    players.push({
      seat: i,
      name,
      stack: opts.startingStack,
      betStreet: 0,
      betHand: 0,
      folded: false,
      allIn: false,
      hole: [],
    });
  }

  return {
    handId: opts.handId,
    seed: opts.seed,
    street: "preflop",
    button: modSeat(opts.button, n),
    sb: opts.sb,
    bb: opts.bb,
    ante,
    players,
    board: [],
    deck,
    pot: 0,
    committed: 0,
    currentBet: 0,
    minRaise: opts.bb,
    lastAggressor: null,
    actingSeat: null,
  };
}

/**
 * Publica antes/ciegas y reparte 2 cartas por jugador.
 * INMUTABLE: clona el estado y devuelve uno nuevo sin modificar el original.
 * - Ante para todos (va al bote, no cuenta como apuesta de la calle).
 * - HU (2j): SB = button, BB = otro. 6-max: SB = button+1, BB = button+2.
 * - All-in si el stack no cubre ante/ciega.
 * - currentBet = maximo apostado en la calle (bb en caso normal).
 * - actingSeat: HU -> SB, resto -> UTG (button+3).
 */
export function postBlindsAndDeal(state: PokerState): PokerState {
  const n: number = state.players.length;
  if (n < 2) throw new Error("Se necesitan al menos 2 jugadores");
  if (state.deck.length < 2 * n) throw new Error("Mazo insuficiente para repartir");

  // Clon profundo minimo (jugadores, holes, board y mazo).
  const players: EnginePlayer[] = state.players.map((p) => ({
    ...p,
    hole: [...p.hole],
  }));
  const deck = [...state.deck];
  const board = [...state.board];

  const btn: number = modSeat(state.button, n);

  // Determina asientos de ciegas.
  let sbSeat: number;
  let bbSeat: number;
  if (n === 2) {
    sbSeat = btn;
    bbSeat = modSeat(btn + 1, n);
  } else {
    sbSeat = modSeat(btn + 1, n);
    bbSeat = modSeat(btn + 2, n);
  }

  let postedTotal: number = 0;

  // Cobra el ante a todos (dinero muerto: suma al bote pero no a betStreet).
  const ante: number = state.ante ?? 0;
  if (ante > 0) {
    for (const p of players) {
      if (p.stack <= 0) continue;
      const a: number = Math.min(ante, p.stack);
      p.stack -= a;
      p.betHand += a;
      postedTotal += a;
      if (p.stack === 0) p.allIn = true;
    }
  }

  // Publica una ciega para un asiento (topeado por stack -> all-in).
  const postBlind = (seat: number, amount: number): void => {
    const p: EnginePlayer = playerBySeat(players, seat);
    if (p.stack <= 0) {
      p.allIn = true;
      return;
    }
    const put: number = Math.min(amount, p.stack);
    p.stack -= put;
    p.betStreet += put;
    p.betHand += put;
    postedTotal += put;
    if (p.stack === 0) p.allIn = true;
  };

  postBlind(sbSeat, state.sb);
  postBlind(bbSeat, state.bb);

  // Apuesta vigente = maximo de la calle (bb en mesa normal).
  let currentBet: number = 0;
  for (const p of players) {
    if (p.betStreet > currentBet) currentBet = p.betStreet;
  }

  // Reparte 2 cartas por jugador, ronda a ronda desde la SB.
  for (let round: number = 0; round < 2; round++) {
    for (let k: number = 0; k < n; k++) {
      const seat: number = modSeat(sbSeat + k, n);
      const p: EnginePlayer = playerBySeat(players, seat);
      const c = deck.pop();
      if (!c) throw new Error("Mazo insuficiente para repartir");
      p.hole.push(c);
    }
  }

  // Turno inicial: HU actua la SB (= button); resto UTG (button+3).
  const actingSeat: number = n === 2 ? sbSeat : modSeat(btn + 3, n);

  const pot: number = state.pot + postedTotal;
  const committed: number = state.committed + postedTotal;

  return {
    ...state,
    button: btn,
    players,
    board,
    deck,
    pot,
    committed,
    currentBet,
    minRaise: state.bb,
    lastAggressor: null,
    actingSeat,
  };
}

/** Asientos que siguen en la mano (no foldeados). */
export function liveSeats(state: PokerState): number[] {
  return state.players.filter((p) => !p.folded).map((p) => p.seat);
}

/** Indica si un asiento puede actuar ahora (no foldeado, no all-in y es su turno). */
export function canAct(state: PokerState, seat: number): boolean {
  const p: EnginePlayer | undefined = state.players.find((x) => x.seat === seat);
  if (!p) return false;
  if (p.folded || p.allIn) return false;
  return state.actingSeat === seat;
}
