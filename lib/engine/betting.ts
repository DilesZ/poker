// Motor de apuestas Texas Hold'em — toCall, acciones legales y aplicación inmutable.
// Sin dependencias. Tipos compartidos en "@/lib/engine/types" (los escribe otro
// agente en paralelo con este mismo contrato):
//   EnginePlayer{seat,name,stack,betStreet,betHand,folded,allIn,hole}
//   PokerState{handId,seed,street,button,sb,bb,ante,players,board,deck,pot,
//     committed,currentBet,minRaise,lastAggressor,actingSeat,winners?}
//   EngineAction = fold|check|call|bet{amount}|raise{to}|allin
//     (bet: cantidad a PONER ahora; raise: total EN CALLE hasta `to`)
//   LegalActions{canFold,canCheck,canCall,callAmount,canBet,betMin,betMax,
//     canRaise,raiseToMin,raiseToMax,canAllIn,allInAmount}
import type { EngineAction, LegalActions, PokerState } from "@/lib/engine/types";

/** Acciones legales vacías: el asiento no puede actuar. */
const SIN_ACCION: LegalActions = {
  canFold: false,
  canCheck: false,
  canCall: false,
  callAmount: 0,
  canBet: false,
  betMin: 0,
  betMax: 0,
  canRaise: false,
  raiseToMin: 0,
  raiseToMax: 0,
  canAllIn: false,
  allInAmount: 0,
};

/** Fichas que `seat` debe poner para igualar: currentBet − betStreet (mínimo 0). */
export function toCall(state: PokerState, seat: number): number {
  const p = state.players.find((x) => x.seat === seat);
  if (!p) return 0;
  return Math.max(0, state.currentBet - p.betStreet);
}

/** ¿Puede `seat` actuar ahora? Le toca, no está foldeado/all-in y tiene fichas. */
function puedeActuar(state: PokerState, seat: number): boolean {
  const p = state.players.find((x) => x.seat === seat);
  if (!p) return false;
  if (state.actingSeat === null || state.actingSeat === undefined) return false;
  if (state.actingSeat !== seat) return false;
  if (p.folded || p.allIn || p.stack <= 0) return false;
  return true;
}

/**
 * Acciones legales de `seat`.
 * - fold: siempre (cuando puede actuar).
 * - check: solo si toCall == 0.
 * - call: si toCall > 0 y stack > 0 (callAmount = min(stack, toCall)).
 * - bet: solo si currentBet == 0 y stack > 0 (entre min(bb, stack) y stack).
 * - raise: solo si currentBet > 0 y stack > toCall (hasta betStreet + stack;
 *   mínima = currentBet + minRaise, salvo all-in corto que llega a menos).
 * - allin: si stack > 0.
 * Si el asiento no puede actuar (foldeado/all-in/no es su turno): todo false/0.
 */
export function getLegalActions(state: PokerState, seat: number): LegalActions {
  if (!puedeActuar(state, seat)) return { ...SIN_ACCION };
  const p = state.players.find((x) => x.seat === seat);
  if (!p) return { ...SIN_ACCION }; // inalcanzable por puedeActuar; lo exige TS
  const resto = toCall(state, seat);
  const canCall = resto > 0 && p.stack > 0;
  const canBet = state.currentBet === 0 && p.stack > 0;
  const canRaise = state.currentBet > 0 && p.stack > resto;
  const maxTo = p.betStreet + p.stack;
  return {
    canFold: true,
    canCheck: resto === 0,
    canCall,
    callAmount: canCall ? Math.min(p.stack, resto) : 0,
    canBet,
    betMin: canBet ? Math.min(state.bb, p.stack) : 0,
    betMax: canBet ? p.stack : 0,
    canRaise,
    raiseToMin: canRaise ? Math.min(state.currentBet + state.minRaise, maxTo) : 0,
    raiseToMax: canRaise ? maxTo : 0,
    canAllIn: p.stack > 0,
    allInAmount: p.stack > 0 ? p.stack : 0,
  };
}

/** Siguiente asiento con opción tras `desdeSeat` (circular, orden del array). */
function siguienteSeat(state: PokerState, desdeSeat: number): number | null {
  const n = state.players.length;
  const i = state.players.findIndex((x) => x.seat === desdeSeat);
  if (i === -1) return null;
  for (let k = 1; k <= n; k++) {
    const p = state.players[(i + k) % n];
    if (!p.folded && !p.allIn && p.stack > 0) return p.seat;
  }
  return null;
}

/**
 * Primer actor de la calle: ancla de cierre cuando nadie agredió.
 * - preflop: la BB (en HU, el otro del botón; si no, dos puestos tras el botón).
 * - postflop: el primero con opción tras el botón.
 */
function primerActor(state: PokerState): number | null {
  const n = state.players.length;
  if (n === 0) return null;
  if (state.street === "preflop") {
    if (n === 2) {
      const otro = state.players.find((p) => p.seat !== state.button);
      return otro ? otro.seat : null;
    }
    const i = state.players.findIndex((p) => p.seat === state.button);
    if (i === -1) return null;
    return state.players[(i + 2) % n].seat;
  }
  const i = state.players.findIndex((p) => p.seat === state.button);
  const base = i === -1 ? 0 : i;
  for (let k = 1; k <= n; k++) {
    const p = state.players[(base + k) % n];
    if (!p.folded && !p.allIn && p.stack > 0) return p.seat;
  }
  return null;
}

/**
 * Siguiente actingSeat tras la acción de `seat`.
 * - Queda 1 vivo → null (si fue por fold, settle resuelve; aquí NO se fija `winners`).
 * - 0 con opción → null (todos all-in: cerrada, settle corre).
 * - 1 con opción → null si no debe nada; si aún debe igualar, le toca a él.
 * - Cierre de ronda (todos los no-foldeados sin all-in igualan currentBet):
 *   · con agresor → al volver al agresor, null;
 *   · sin agresor y con apuesta (ciegas preflop) → cuando el ancla (BB) acaba
 *     de actuar, null (así la BB conserva su opción tras un limp);
 *   · sin agresor ni apuesta → al volver al primer actor, null.
 * Nota: los all-in cortos están exentos de igualar (nunca podrían).
 */
function avanzarTurno(state: PokerState, seat: number): number | null {
  const vivos = state.players.filter((p) => !p.folded);
  if (vivos.length <= 1) return null;
  const conOpcion = state.players.filter((p) => !p.folded && !p.allIn && p.stack > 0);
  if (conOpcion.length === 0) return null;
  if (conOpcion.length === 1) {
    const unico = conOpcion[0];
    if (state.currentBet - unico.betStreet <= 0) return null;
    return unico.seat;
  }
  const igualados = state.players
    .filter((p) => !p.folded && !p.allIn)
    .every((p) => p.betStreet === state.currentBet);
  const siguiente = siguienteSeat(state, seat);
  if (siguiente === null) return null;
  if (!igualados) return siguiente;
  const ancla = state.lastAggressor ?? primerActor(state);
  if (ancla === null || ancla === undefined) return null;
  const anclaConOpcion = state.players.some(
    (p) => p.seat === ancla && !p.folded && !p.allIn && p.stack > 0,
  );
  if (!anclaConOpcion) return null;
  if (state.lastAggressor !== null && state.lastAggressor !== undefined) {
    return siguiente === ancla ? null : siguiente;
  }
  if (state.currentBet > 0) {
    return seat === ancla ? null : siguiente;
  }
  return siguiente === ancla ? null : siguiente;
}

/**
 * Aplica una acción y devuelve el estado NUEVO (inmutable: clona players,
 * board y deck; no muta la entrada). Acciones ilegales → Error descriptivo.
 * - fold: marca folded. Si queda 1 vivo, actingSeat = null y `winners` queda
 *   sin fijar (lo resuelve settle).
 * - check: solo con toCall == 0.
 * - call: paga min(stack, toCall); all-in si queda a 0.
 * - bet: solo con currentBet == 0; amount se limita a [min(stack, bb), stack];
 *   currentBet = betStreet del apostador, minRaise = amount, lastAggressor = seat.
 * - raise: `to` se limita por arriba al all-in; incremento = to − currentBet ≥
 *   minRaise, salvo all-in corto (queda all-in con menos: currentBet = to pero
 *   minRaise y lastAggressor NO cambian, no reabre).
 * - allin: paga el stack entero; si supera currentBet aplica la regla del
 *   short-raise (solo reabre con incremento ≥ minRaise).
 * Tras pagar: stack −= x, betStreet += x, betHand += x, pot = ΣbetHand;
 * `committed` se pasa sin cambios (es el total inicial).
 */
export function applyAction(state: PokerState, seat: number, action: EngineAction): PokerState {
  const i = state.players.findIndex((p) => p.seat === seat);
  if (i === -1) throw new Error(`Asiento ${seat} no existe en la mano.`);
  if (state.actingSeat === null || state.actingSeat === undefined) {
    throw new Error(`Acción ilegal: la ronda de apuestas está cerrada (actingSeat null).`);
  }
  if (state.actingSeat !== seat) {
    throw new Error(
      `Acción ilegal: no es el turno del asiento ${seat} (actúa el ${state.actingSeat}).`,
    );
  }
  const yo = state.players[i];
  if (yo.folded) throw new Error(`Acción ilegal: el asiento ${seat} ya está retirado.`);
  if (yo.allIn || yo.stack <= 0) {
    throw new Error(`Acción ilegal: el asiento ${seat} está all-in o sin fichas.`);
  }

  // Clon profundo (players + hole) y copias de board/deck: la entrada no se muta.
  const siguiente: PokerState = {
    ...state,
    players: state.players.map((p) => ({ ...p, hole: [...p.hole] })),
    board: [...state.board],
    deck: [...state.deck],
  };
  const heroe = siguiente.players[i];
  const resto = Math.max(0, siguiente.currentBet - heroe.betStreet);

  const pagar = (fichas: number): void => {
    if (!Number.isFinite(fichas) || fichas <= 0) {
      throw new Error(`Cantidad inválida (${String(fichas)}) para el asiento ${seat}.`);
    }
    if (fichas > heroe.stack) {
      throw new Error(`El asiento ${seat} no puede poner ${fichas} (stack ${heroe.stack}).`);
    }
    heroe.stack -= fichas;
    heroe.betStreet += fichas;
    heroe.betHand += fichas;
    if (heroe.stack === 0) heroe.allIn = true;
  };
  const recalcularBote = (): void => {
    siguiente.pot = siguiente.players.reduce((acc, p) => acc + p.betHand, 0);
  };

  switch (action.type) {
    case "fold": {
      heroe.folded = true;
      recalcularBote();
      break;
    }
    case "check": {
      if (resto > 0) {
        throw new Error(
          `Check ilegal en asiento ${seat}: hay que igualar ${resto} (usa call, raise o fold).`,
        );
      }
      break;
    }
    case "call": {
      if (resto <= 0) {
        throw new Error(`Call ilegal en asiento ${seat}: no hay nada que igualar (usa check).`);
      }
      pagar(Math.min(heroe.stack, resto));
      recalcularBote();
      break;
    }
    case "bet": {
      if (siguiente.currentBet !== 0) {
        throw new Error(
          `Bet ilegal en asiento ${seat}: ya hay apuesta ${siguiente.currentBet} (usa raise).`,
        );
      }
      if (!Number.isFinite(action.amount)) {
        throw new Error(`Bet ilegal en asiento ${seat}: cantidad no numérica.`);
      }
      const minimo = Math.min(siguiente.bb, heroe.stack);
      const fichas = Math.min(Math.max(action.amount, minimo), heroe.stack);
      pagar(fichas);
      siguiente.currentBet = heroe.betStreet;
      siguiente.minRaise = fichas;
      siguiente.lastAggressor = seat;
      recalcularBote();
      break;
    }
    case "raise": {
      if (siguiente.currentBet <= 0) {
        throw new Error(`Raise ilegal en asiento ${seat}: no hay apuesta que subir (usa bet).`);
      }
      if (!Number.isFinite(action.to)) {
        throw new Error(`Raise ilegal en asiento ${seat}: destino ('to') no numérico.`);
      }
      if (heroe.stack <= resto) {
        throw new Error(
          `Raise ilegal en asiento ${seat}: sin fichas para subir ` +
            `(solo puede igualar ${Math.min(heroe.stack, resto)} o ir all-in).`,
        );
      }
      const maxTo = heroe.betStreet + heroe.stack;
      const to = Math.min(action.to, maxTo);
      if (to <= siguiente.currentBet) {
        throw new Error(
          `Raise ilegal en asiento ${seat}: 'to' (${action.to}) debe superar ` +
            `la apuesta actual (${siguiente.currentBet}).`,
        );
      }
      const incremento = to - siguiente.currentBet;
      const esAllIn = to === maxTo;
      if (incremento < siguiente.minRaise && !esAllIn) {
        throw new Error(
          `Raise ilegal en asiento ${seat}: subir a ${to} (incremento ${incremento}) ` +
            `no llega al mínimo (${siguiente.currentBet + siguiente.minRaise}).`,
        );
      }
      pagar(to - heroe.betStreet);
      siguiente.currentBet = to;
      if (incremento >= siguiente.minRaise) {
        siguiente.minRaise = incremento;
        siguiente.lastAggressor = seat;
      }
      // All-in corto: currentBet = to, pero minRaise y lastAggressor NO cambian.
      recalcularBote();
      break;
    }
    case "allin": {
      const apuestaAnterior = siguiente.currentBet;
      const minimoAnterior = siguiente.minRaise;
      const fichas = heroe.stack;
      pagar(fichas);
      if (apuestaAnterior === 0) {
        // Apertura all-in: como un bet.
        siguiente.currentBet = heroe.betStreet;
        siguiente.minRaise = fichas;
        siguiente.lastAggressor = seat;
      } else if (heroe.betStreet > apuestaAnterior) {
        const incremento = heroe.betStreet - apuestaAnterior;
        siguiente.currentBet = heroe.betStreet;
        if (incremento >= minimoAnterior) {
          siguiente.minRaise = incremento;
          siguiente.lastAggressor = seat;
        }
        // Corto: currentBet sube pero minRaise y lastAggressor NO cambian.
      }
      recalcularBote();
      break;
    }
    default: {
      const exhaustivo: never = action;
      throw new Error(`Acción desconocida: ${JSON.stringify(exhaustivo)}.`);
    }
  }

  siguiente.actingSeat = avanzarTurno(siguiente, seat);
  return siguiente;
}
