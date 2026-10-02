// Liquidación de la mano: avance de calles, devolución de apuesta no igualada,
// botes laterales, showdown y verificación de conservación de fichas.
//
// Todo INMUTABLE: ninguna función muta el `state` recibido ni sus arrays;
// siempre devuelven objetos nuevos. Cero dependencias salvo el evaluador.
//
// Contabilidad del motor (contrato compartido):
//   UN SOLO BOTE: pot == Σ(betHand) siempre. `betStreet` se resetea por calle
//   (informativo para toCall) pero `betHand` acumula TODA la mano (lo necesitan
//   los botes laterales). Conservación: Σ(stack) + pot === totalInicial.
import { compareRanks, evaluate7, type HandRank } from "@/lib/poker/evaluator";
import type { Card } from "@/lib/poker/types";
import type { EnginePlayer, PokerState } from "@/lib/engine/types";

/** Bote lateral: cantidad a repartir y asientos con derecho a ganarlo. */
export interface SidePot {
  amount: number;
  eligible: number[];
}

/** Devolución de apuesta no igualada a un jugador. */
export interface Refund {
  seat: number;
  amount: number;
}

// ---------------------------------------------------------------------------
// Utilidades internas
// ---------------------------------------------------------------------------

/** Jugadores vivos (no retirados). */
function vivos(state: PokerState): EnginePlayer[] {
  return state.players.filter((p) => !p.folded);
}

/** ¿Puede actuar? Vivo, no all-in y con fichas. */
function puedeActuar(p: EnginePlayer): boolean {
  return !p.folded && !p.allIn && p.stack > 0;
}

/**
 * Asientos ordenados desde la izquierda del botón (button+1 circular).
 * Funciona con asientos no consecutivos: toma el primer asiento mayor que
 * el botón y envuelve hacia el menor.
 */
function asientosIzquierdaButton(button: number, asientos: number[]): number[] {
  const ordenados = [...asientos].sort((a, b) => a - b);
  if (ordenados.length === 0) return [];
  let i = ordenados.findIndex((s) => s > button);
  if (i === -1) i = 0;
  return [...ordenados.slice(i), ...ordenados.slice(0, i)];
}

function clonarJugador(p: EnginePlayer): EnginePlayer {
  return { ...p, hole: [...p.hole] };
}

// ---------------------------------------------------------------------------
// Avance de calle
// ---------------------------------------------------------------------------

/**
 * Avanza a la siguiente calle cuando la ronda de apuestas está cerrada.
 * Requiere `actingSeat == null` y al menos 2 vivos; si no, lanza.
 * Quema 1 carta y reparte flop+3 / turn+1 / river+1 (la cima del `deck` es el
 * final del array). Lanza si el deck no cubre quema+reparto.
 * Resetea `betStreet`, `currentBet`, `minRaise=bb` y `lastAggressor`.
 * `actingSeat` = primer jugador que pueda actuar desde button+1; null si
 * nadie puede (runout con todos all-in). Desde "river" cerrada pasa a
 * "showdown" sin repartir (el showdown lo resuelve `settleShowdown`).
 */
export function advanceStreet(state: PokerState, rng: () => number): PokerState {
  void rng; // la baraja ya viene barajada en `deck`; aquí no se aleatoriza.
  if (state.actingSeat != null) {
    throw new Error(`advanceStreet requiere calle cerrada (actingSeat=${state.actingSeat})`);
  }
  if (vivos(state).length < 2) {
    throw new Error("advanceStreet requiere al menos 2 jugadores vivos");
  }
  if (state.street === "showdown" || state.street === "done") {
    throw new Error(`advanceStreet no aplica en calle "${state.street}"`);
  }

  const deck = [...state.deck];
  const board = [...state.board];
  const robar = (): Card => {
    const carta = deck.pop();
    if (carta === undefined) throw new Error("deck insuficiente para avanzar de calle");
    return carta;
  };

  let street: PokerState["street"];
  if (state.street === "preflop") {
    if (deck.length < 4) throw new Error("deck insuficiente para el flop (quema+3)");
    robar(); // quema
    board.push(robar(), robar(), robar());
    street = "flop";
  } else if (state.street === "flop") {
    if (deck.length < 2) throw new Error("deck insuficiente para el turn (quema+1)");
    robar(); // quema
    board.push(robar());
    street = "turn";
  } else if (state.street === "turn") {
    if (deck.length < 2) throw new Error("deck insuficiente para el river (quema+1)");
    robar(); // quema
    board.push(robar());
    street = "river";
  } else if (state.street === "river") {
    // Calle cerrada sin más cartas: el showdown lo hace `settleShowdown`.
    street = "showdown";
  } else {
    throw new Error(`advanceStreet no reconoce la calle "${state.street}"`);
  }

  const jugadores = state.players.map((p) => ({ ...clonarJugador(p), betStreet: 0 }));
  const orden = asientosIzquierdaButton(
    state.button,
    state.players.map((p) => p.seat),
  );
  const siguiente = orden.find((seat) => {
    const j = jugadores.find((x) => x.seat === seat);
    return j !== undefined && puedeActuar(j);
  });

  return {
    ...state,
    street,
    board,
    deck,
    players: jugadores,
    currentBet: 0,
    minRaise: state.bb,
    lastAggressor: null,
    actingSeat: siguiente === undefined ? null : siguiente,
    history: [...(state.history ?? []), `/${street}`],
  };
}

// ---------------------------------------------------------------------------
// Botes laterales y devolución de apuesta no igualada
// ---------------------------------------------------------------------------

/**
 * Construye los botes laterales a partir de `betHand` (puros, sin devoluciones:
 * llama a `refundUncalled` antes si puede haber apuesta no igualada).
 * Niveles de `betHand > 0` ordenados; cada bote = (nivel - anterior) × nº de
 * contribuyentes con `betHand >= nivel`; `eligible` = contribuyentes no
 * retirados. Bote principal primero.
 */
export function buildSidePots(state: PokerState): SidePot[] {
  const niveles = [...new Set(state.players.filter((p) => p.betHand > 0).map((p) => p.betHand))].sort(
    (a, b) => a - b,
  );
  const botes: SidePot[] = [];
  let previo = 0;
  for (const nivel of niveles) {
    const contribuyentes = state.players.filter((p) => p.betHand >= nivel);
    const amount = (nivel - previo) * contribuyentes.length;
    if (amount > 0) {
      botes.push({
        amount,
        eligible: contribuyentes.filter((p) => !p.folded).map((p) => p.seat),
      });
    }
    previo = nivel;
  }
  return botes;
}

/**
 * Devuelve a cada jugador no-allin (y no retirado) todo lo que exceda el
 * máximo `betHand` entre los DEMÁS jugadores. El tope incluye a todos los
 * demás (retirados y all-in cortos): las fichas de quien se retiró ya
 * pertenecen al bote y los all-in cortos sí igualan hasta su resto.
 * Itera hasta estabilizar (el orden de devolución no altera el resultado).
 * No muta el estado; acumula por asiento lo devuelto.
 */
export function refundUncalled(state: PokerState): { state: PokerState; refunded: Refund[] } {
  const jugadores = state.players.map(clonarJugador);
  const acumulado = new Map<number, number>();
  let cambios = true;
  while (cambios) {
    cambios = false;
    for (const p of jugadores) {
      if (p.folded || p.allIn) continue;
      let tope = 0;
      for (const q of jugadores) {
        if (q.seat !== p.seat && q.betHand > tope) tope = q.betHand;
      }
      if (p.betHand > tope) {
        const exceso = p.betHand - tope;
        p.betHand -= exceso;
        p.stack += exceso;
        acumulado.set(p.seat, (acumulado.get(p.seat) ?? 0) + exceso);
        cambios = true;
      }
    }
  }
  const refunded = [...acumulado.entries()].map(([seat, amount]) => ({ seat, amount }));
  const pot = jugadores.reduce((acc, p) => acc + p.betHand, 0);
  return { state: { ...state, players: jugadores, pot }, refunded };
}

// ---------------------------------------------------------------------------
// Showdown y bote no disputado
// ---------------------------------------------------------------------------

/**
 * Liquida el showdown. Requiere calle "showdown" y board de 5 cartas.
 * Si queda un solo vivo, delega en `awardUncontested`.
 * 1) Aplica `refundUncalled` (deja pot == ΣbetHand). 2) Construye botes con
 * `buildSidePots` (ya suman ΣbetHand == pot: NO se suma `pot` aparte).
 * 3) Por bote: contendientes = elegibles + vivos + 2 hole; mejor `evaluate7(hole+board)` con
 * `compareRanks`; split floor y odd chips de 1 en 1 al ganador más cercano a
 * la izquierda del button (circular). Acredita stacks, pone todo a 0, calle
 * "done" y fija `winners` (orden de primer cobro: por bote, izquierda-button).
 */
export function settleShowdown(state: PokerState): PokerState {
  if (state.street !== "showdown") {
    throw new Error(`settleShowdown requiere calle "showdown" (actual: "${state.street}")`);
  }
  if (state.board.length !== 5) {
    throw new Error(`settleShowdown requiere board de 5 cartas (actual: ${state.board.length})`);
  }
  const live = vivos(state);
  if (live.length === 0) throw new Error("settleShowdown sin jugadores vivos");
  if (live.length === 1) return awardUncontested(state);

  const base = refundUncalled(state).state;
  const botes = buildSidePots(base);
  if (botes.length === 0 && base.pot > 0) {
    // Salvaguarda para estados construidos a mano (sin betHand): reparte el
    // bote declarado entre los vivos en vez de quemar fichas.
    botes.push({ amount: base.pot, eligible: vivos(base).map((p) => p.seat) });
  }

  const ganados = new Map<number, number>();
  const ganadores: number[] = [];

  for (const bote of botes) {
    if (bote.amount <= 0) continue;
    let elegibles = base.players.filter((p) => bote.eligible.includes(p.seat) && !p.folded);
    if (elegibles.length === 0) elegibles = vivos(base); // salvaguarda: nunca quemar fichas
    const conCartas = elegibles.filter((p) => p.hole.length === 2);
    const candidatos = conCartas.length > 0 ? conCartas : elegibles;

    let empatados: EnginePlayer[];
    if (conCartas.length > 0) {
      const rangos = new Map<number, HandRank>();
      for (const c of conCartas) rangos.set(c.seat, evaluate7([...c.hole, ...base.board]));
      let mejor: HandRank = rangos.get(conCartas[0]!.seat)!;
      for (const r of rangos.values()) {
        if (compareRanks(r, mejor) > 0) mejor = r;
      }
      empatados = conCartas.filter((c) => compareRanks(rangos.get(c.seat)!, mejor) === 0);
    } else {
      empatados = [...candidatos]; // sin cartas: reparto a partes iguales
    }

    const orden = asientosIzquierdaButton(
      base.button,
      empatados.map((p) => p.seat),
    );
    const parte = Math.floor(bote.amount / empatados.length);
    let resto = bote.amount % empatados.length;
    for (const e of empatados) {
      ganados.set(e.seat, (ganados.get(e.seat) ?? 0) + parte);
    }
    for (const seat of orden) {
      if (resto === 0) break;
      ganados.set(seat, (ganados.get(seat) ?? 0) + 1);
      resto -= 1;
    }
    for (const seat of orden) {
      if (!ganadores.includes(seat)) ganadores.push(seat);
    }
  }

  const jugadores = base.players.map((p) => ({
    ...clonarJugador(p),
    stack: p.stack + (ganados.get(p.seat) ?? 0),
    betStreet: 0,
    betHand: 0,
  }));

  return {
    ...base,
    players: jugadores,
    pot: 0,
    currentBet: 0,
    lastAggressor: null,
    actingSeat: null,
    street: "done",
    winners: ganadores,
  };
}

/**
 * Bote no disputado: un solo vivo se lleva el bote (`pot`, que por invariante
 * vale ΣbetHand). Se usa `max(pot, ΣbetHand)` por robustez ante estados
 * construidos a mano. Todo a 0, calle "done", `winners=[seat]`.
 * Lanza si no hay exactamente 1 vivo.
 */
export function awardUncontested(state: PokerState): PokerState {
  const live = vivos(state);
  if (live.length !== 1) {
    throw new Error(`awardUncontested requiere un único jugador vivo (actual: ${live.length})`);
  }
  const ganador = live[0]!;
  const apuestas = state.players.reduce((acc, p) => acc + p.betHand, 0);
  const bote = Math.max(state.pot, apuestas);
  const jugadores = state.players.map((p) => ({
    ...clonarJugador(p),
    stack: p.seat === ganador.seat ? p.stack + bote : p.stack,
    betStreet: 0,
    betHand: 0,
  }));
  return {
    ...state,
    players: jugadores,
    pot: 0,
    currentBet: 0,
    lastAggressor: null,
    actingSeat: null,
    street: "done",
    winners: [ganador.seat],
  };
}

// ---------------------------------------------------------------------------
// Conservación
// ---------------------------------------------------------------------------

/**
 * Verifica que no se crean ni destruyen fichas (modelo de bote único):
 * Σ(stack) + pot === totalInicial, con pot == Σ(betHand).
 * Lanza si descuadra o si el bote es incoherente con las apuestas.
 */
export function verifyConservation(state: PokerState, totalInicial: number): void {
  const enStacks = state.players.reduce((acc, p) => acc + p.stack, 0);
  const enApuestas = state.players.reduce((acc, p) => acc + p.betHand, 0);
  if (state.pot !== enApuestas) {
    throw new Error(`bote incoherente: pot=${state.pot} pero ΣbetHand=${enApuestas}`);
  }
  const total = enStacks + state.pot;
  if (total !== totalInicial) {
    throw new Error(`conservación violada: esperado ${totalInicial}, actual ${total}`);
  }
}
