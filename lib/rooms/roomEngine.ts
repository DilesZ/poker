// Motor de salas: mano, calles, cierres de ronda, turno del agente y reflexión.
// Lógica pura (sin Next ni almacenamiento): la sala completa la aporta el llamante.
import {
  chooseBrainAction,
  reflectOnHand,
  type BrainAction,
  type BrainContext,
  type BrainLegal,
} from "../agent/brain";
import { buildHandRecord, type AccionMano } from "../agent/reflection";
import { newDeck, shuffle } from "../poker/deck";
import { advanceStreet, deal, handName, refreshPot, showdown } from "../poker/game";
import type { Card, GameState, PlayerState } from "../poker/types";
import type { RoomView } from "./client";
import type { Room } from "./types";
import { STACK_INICIAL } from "./types";

/** GameState + metadatos de mano (se serializan junto con la sala). */
export interface EstadoSalas extends GameState {
  agentSeat?: number;
  /** Asientos que ya actuaron en la calle actual. */
  acted?: number[];
  /** Acciones del agente en la mano (para reflexionar al cerrar). */
  historial?: AccionMano[];
  stackInicioAgente?: number;
  ganadorTexto?: string;
  reflejada?: boolean;
  iniciada?: boolean;
  showdownFinal?: boolean;
  /** Límite de turno (ms epoch). Se renueva al cambiar el turno. */
  deadlineActing?: number;
}

/** Ventana de turno: 30s por decisión. */
export const TURNO_MS = 30000;

export type AccionSala = {
  type: "fold" | "check" | "call" | "raise" | "allin" | "nextStreet";
  size?: number;
};

export interface ResultadoMano {
  state: GameState;
  actingSeat?: number;
  handOver: boolean;
  winnerText?: string;
  agentLesson?: string;
}

export interface ResultadoSala extends ResultadoMano {
  ok: boolean;
  error?: string;
}

const CIEGA_PEQUENA = 10;
const CIEGA_GRANDE = 20;
const RANGOS: Record<number, string> = { 11: "J", 12: "Q", 13: "K", 14: "A" };

/** Estado base de sala vacía: nadie sentado aún; repartir con iniciarMano. */
export function initRoomState(maxPlayers: number, withAgent: boolean): EstadoSalas {
  return {
    players: [],
    button: 0,
    smallBlind: CIEGA_PEQUENA,
    bigBlind: CIEGA_GRANDE,
    street: "done",
    board: [],
    deck: shuffle(newDeck()),
    pot: 0,
    sidePots: [],
    currentBet: 0,
    agentSeat: withAgent ? maxPlayers - 1 : -1,
    acted: [],
    historial: [],
    iniciada: false,
  };
}

/** Presentes mínimos para repartir (incluido el agente): 1v1 → 2, multi → 3. */
export function minimoJugadores(maxPlayers: number): number {
  return maxPlayers <= 2 ? 2 : 3;
}

export function estadoDe(room: Room): EstadoSalas {
  return room.state as EstadoSalas;
}

export function enJuego(room: Room): boolean {
  const e = estadoDe(room);
  return e.iniciada === true && e.street !== "done";
}

export function terminada(room: Room): boolean {
  const e = estadoDe(room);
  return e.iniciada === true && e.street === "done";
}

/** Quita del estado a los asientos que ya no están en la sala (nunca con mano viva). */
export function podar(room: Room): void {
  if (enJuego(room)) return;
  const e = estadoDe(room);
  const asientos = new Set(room.players.map((p) => p.seat));
  e.players = e.players.filter((p) => asientos.has(p.id));
}

/** Reparte una mano nueva con los presentes (agente incluido). */
export function iniciarMano(room: Room): void {
  const participantes = [...room.players].sort((a, b) => a.seat - b.seat);
  if (participantes.length < 2) return;
  const previo = estadoDe(room);
  const stacks = new Map(previo.players.map((p) => [p.id, p.stack]));
  const players: PlayerState[] = participantes.map((rp) => ({
    id: rp.seat,
    name: rp.name,
    stack: recomprar(stacks.get(rp.seat) ?? rp.stack),
    bet: 0,
    folded: false,
    allIn: false,
    hole: [],
    isHero: false,
  }));
  const botonPrevio = previo.iniciada === true ? previo.button : -1;
  const trasBoton = players.find((p) => p.id > botonPrevio) ?? players[0];
  const nuevo: EstadoSalas = {
    ...initRoomState(room.maxPlayers, room.withAgent),
    players,
    button: trasBoton.id,
    street: "preflop",
    stackInicioAgente: players.find((p) => p.id === previo.agentSeat)?.stack,
  };
  postearCiegas(nuevo);
  deal(nuevo);
  nuevo.iniciada = true;
  nuevo.deadlineActing = Date.now() + TURNO_MS;
  room.state = nuevo;
  room.lesson = undefined;
}

/** ¿Expiró el turno actual? True si Date.now() supera deadlineActing con mano viva. */
export function isTurnExpired(room: Room): boolean {
  const e = estadoDe(room);
  if (e.iniciada !== true || e.street === "done") return false;
  if (typeof e.deadlineActing !== "number") return false;
  return Date.now() > e.deadlineActing;
}

/** Renueva el límite de turno si la mano sigue viva; lo limpia al cerrar. */
function tocarDeadline(e: EstadoSalas): void {
  if (e.iniciada === true && e.street !== "done" && calcularActingSeat(e) !== undefined) {
    e.deadlineActing = Date.now() + TURNO_MS;
  } else {
    e.deadlineActing = undefined;
  }
}

/** Asiento que debe actuar; undefined si la calle/mano ya cerró. */
export function calcularActingSeat(state: GameState): number | undefined {
  const e = state as EstadoSalas;
  if (e.iniciada !== true || e.street === "done" || e.players.length < 2) return undefined;
  const n = e.players.length;
  const idxBoton = Math.max(0, e.players.findIndex((p) => p.id === e.button));
  const inicio =
    e.street === "preflop" ? (indicesCiegas(n, idxBoton).bb + 1) % n : (idxBoton + 1) % n;
  const act = e.acted ?? [];
  for (let k = 0; k < n; k++) {
    const p = e.players[(inicio + k) % n];
    if (p.folded || p.allIn) continue;
    if (!act.includes(p.id) || p.bet < e.currentBet) return p.id;
  }
  return undefined;
}

/** Aplica la acción del asiento y cierra calle/mano si procede. */
export function aplicarAccion(
  state: GameState,
  seat: number,
  accion: AccionSala,
): ResultadoMano {
  const e = state as EstadoSalas;
  const jugador = e.players.find((p) => p.id === seat);
  if (e.iniciada === true && e.street !== "done" && accion.type !== "nextStreet" && jugador) {
    aplicarUna(e, jugador, accion);
    refreshPot(e);
    resolverCierre(e);
  }
  return resultadoDe(e);
}

/** Cierra la mano (queda uno en pie) o la calle (nadie pendiente de actuar). */
export function resolverCierre(e: EstadoSalas): void {
  if (e.iniciada !== true || e.street === "done") return;
  const vivos = e.players.filter((p) => !p.folded);
  if (vivos.length === 1) {
    ganarPorFold(e, vivos[0]);
    return;
  }
  if (pendientes(e).length > 0) return;
  const activos = vivos.filter((p) => !p.allIn);
  if (activos.length <= 1 || e.street === "river") {
    correrShowdown(e);
    return;
  }
  avanzarCalle(e);
}

/** Mueve al agente mientras le toque (hasta que pase el turno o termine la mano). */
export function jugarAgente(room: Room): void {
  if (!room.withAgent) return;
  for (let paso = 0; paso < 50; paso++) {
    const e = estadoDe(room);
    if (e.iniciada !== true || e.street === "done") return;
    const turno = calcularActingSeat(e);
    if (turno === undefined || turno !== e.agentSeat) return;
    const jugador = e.players.find((p) => p.id === turno);
    if (!jugador) return;
    const accion = chooseBrainAction(room.brain, legales(e, jugador), contexto(e, jugador));
    aplicarAccion(e, turno, { type: accion.type, size: accion.size });
  }
}

/** Reflexiona sobre la mano terminada: actualiza el brain y devuelve la lección. */
export function reflejar(room: Room): string | undefined {
  const e = estadoDe(room);
  if (e.iniciada !== true || e.street !== "done") return undefined;
  if (e.reflejada) return room.lesson;
  e.reflejada = true;
  const agente = e.players.find((p) => p.id === e.agentSeat);
  if (!agente || agente.hole.length !== 2) return room.lesson;
  const historial = e.historial ?? [];
  const ultima = historial[historial.length - 1];
  const delta = agente.stack - (e.stackInicioAgente ?? agente.stack);
  const numRivales = Math.max(0, e.players.length - 1);
  const registro = buildHandRecord({
    won: delta > 0,
    myCards: agente.hole.map(cartaCorta).join(" "),
    board: e.board.map(cartaCorta).join(" "),
    street: ultima?.street ?? (e.showdownFinal ? "river" : "preflop"),
    actions: historial,
    showdown: e.showdownFinal === true,
    potWon: Math.max(0, delta + agente.bet),
    stackDelta: delta,
    numRivales,
  });
  const resultado = reflectOnHand(room.brain, registro);
  room.brain = resultado.brain;
  if (resultado.lesson) {
    const l = resultado.lesson;
    room.lesson = `${l.situation}: ${l.insight} (${l.change})`;
  }
  return room.lesson;
}

/**
 * Orquesta una acción de jugador: turno del agente por delante, cierre de mano
 * y reflexión. `nextStreet` inicia la mano siguiente.
 */
export function ejecutarAccion(room: Room, seat: number, accion: AccionSala): ResultadoSala {
  const e = estadoDe(room);
  if (accion.type === "nextStreet") {
    // Solo participantes pueden avanzar/repartir.
    if (!room.players.some((p) => p.seat === seat)) {
      return fallo(e, "Solo los participantes pueden avanzar la mano.");
    }
    if (e.iniciada === true && e.street !== "done") return fallo(e, "La mano sigue en juego.");
    if (room.players.length >= minimoJugadores(room.maxPlayers)) {
      iniciarMano(room);
      jugarAgente(room);
      reflejar(room);
      tocarDeadline(estadoDe(room));
    }
    return okSala(room);
  }
  if (e.iniciada !== true) return fallo(e, "La mano todavía no ha empezado.");
  if (e.street === "done") return fallo(e, "La mano ya ha terminado.");
  // Expiración: auto-fold del asiento que debía actuar (vía aplicarUna).
  if (isTurnExpired(room)) {
    const expirado = calcularActingSeat(e);
    const jugExp = e.players.find((p) => p.id === expirado);
    if (expirado !== undefined && jugExp) {
      aplicarUna(e, jugExp, { type: "fold" });
      refreshPot(e);
      resolverCierre(e);
      jugarAgente(room);
      reflejar(room);
      tocarDeadline(e);
      // Si el expirado ya se resolvió, la acción tardía no se aplica.
      if (expirado === seat) return okSala(room);
      // Si le toca al solicitante tras el auto-fold, sigue el flujo normal.
      if (calcularActingSeat(e) !== seat) return okSala(room);
    }
  }
  if (calcularActingSeat(e) === e.agentSeat) {
    jugarAgente(room);
    if (estadoDe(room).street === "done") return okSala(room);
  }
  if (calcularActingSeat(e) !== seat) return fallo(e, "No es tu turno.");
  aplicarAccion(e, seat, accion);
  jugarAgente(room);
  reflejar(room);
  tocarDeadline(e);
  return okSala(room);
}

/** Vista pública de la sala: sin mazo, sin cartas ajenas, solo mi HU. */
export function construirVista(room: Room, clientId?: string): RoomView {
  const e = estadoDe(room);
  const jugando = e.iniciada === true && e.street !== "done";
  const revelar = e.showdownFinal === true;
  const asientos = new Set(room.players.map((p) => p.seat));
  const yo = clientId ? room.players.find((p) => p.clientId === clientId) : undefined;
  const mias = yo ? e.players.find((p) => p.id === yo.seat)?.hole : undefined;
  return {
    code: room.code,
    players: room.players.map((p) => ({
      ...p,
      stack: e.players.find((x) => x.id === p.seat)?.stack ?? p.stack,
    })),
    state: {
      ...e,
      players: e.players
        .filter((p) => asientos.has(p.id))
        .map((p) => (revelar ? { ...p } : { ...p, hole: [] })),
      deck: [],
      acted: undefined,
      historial: undefined,
      stackInicioAgente: undefined,
      reflejada: undefined,
      iniciada: undefined,
      agentSeat: undefined,
    },
    version: room.version,
    myHole: mias,
    agentLesson: room.lesson,
    yourSeat: yo?.seat,
    actingSeat: jugando ? calcularActingSeat(e) : undefined,
    handOver: e.iniciada === true && e.street === "done",
    winnerText: e.ganadorTexto,
  };
}

function aplicarUna(e: EstadoSalas, p: PlayerState, accion: AccionSala): void {
  const precio = Math.max(0, e.currentBet - p.bet);
  const apuestaMax = p.bet + p.stack;
  let tipo: AccionMano["type"] = accion.type === "nextStreet" ? "check" : accion.type;
  let cantidad = 0;

  if (tipo === "fold") {
    p.folded = true;
  } else if (tipo === "check") {
    if (precio > 0) {
      tipo = "call";
      cantidad = postear(p, precio);
    }
  } else if (tipo === "call") {
    if (precio <= 0) {
      tipo = "check";
    } else {
      cantidad = postear(p, precio);
      if (p.stack === 0) tipo = "allin";
    }
  } else if (tipo === "raise") {
    // size = apuesta total a alcanzar («subir a X»); sin size, abre 0.5*bote.
    const deseada = accion.size ?? Math.max(e.currentBet + 1, Math.round(e.pot * 0.5));
    const objetivo = Math.min(Math.max(Math.floor(deseada), e.currentBet + 1), apuestaMax);
    cantidad = Math.max(0, objetivo - p.bet);
    p.stack -= cantidad;
    p.bet += cantidad;
    if (p.stack === 0) p.allIn = true;
    if (p.bet <= e.currentBet) tipo = "call";
  } else if (tipo === "allin") {
    cantidad = p.stack;
    p.stack = 0;
    p.allIn = true;
    p.bet += cantidad;
    if (p.bet <= e.currentBet) tipo = "call";
  }

  if (p.bet > e.currentBet) {
    e.currentBet = p.bet;
    e.acted = [p.id];
  } else if (!e.acted?.includes(p.id)) {
    e.acted = [...(e.acted ?? []), p.id];
  }

  if (p.id === e.agentSeat && e.historial) {
    e.historial.push({
      street: e.street,
      type: tipo,
      amount: cantidad || undefined,
      toCall: precio,
    });
  }
}

function indicesCiegas(n: number, idxBoton: number): { sb: number; bb: number } {
  if (n === 2) return { sb: idxBoton, bb: (idxBoton + 1) % 2 };
  return { sb: (idxBoton + 1) % n, bb: (idxBoton + 2) % n };
}

function postearCiegas(e: EstadoSalas): void {
  const n = e.players.length;
  const idxBoton = Math.max(0, e.players.findIndex((p) => p.id === e.button));
  const { sb, bb } = indicesCiegas(n, idxBoton);
  postear(e.players[sb], e.smallBlind);
  postear(e.players[bb], e.bigBlind);
  e.currentBet = e.bigBlind;
  refreshPot(e);
}

function postear(p: PlayerState, cantidad: number): number {
  const real = Math.min(p.stack, Math.max(0, cantidad));
  p.stack -= real;
  p.bet += real;
  if (p.stack === 0) p.allIn = true;
  return real;
}

function recomprar(stack: number): number {
  return stack < CIEGA_GRANDE ? STACK_INICIAL : stack;
}

function pendientes(e: EstadoSalas): PlayerState[] {
  const act = e.acted ?? [];
  return e.players.filter(
    (p) => !p.folded && !p.allIn && (!act.includes(p.id) || p.bet < e.currentBet),
  );
}

function avanzarCalle(e: EstadoSalas): void {
  advanceStreet(e);
  e.acted = [];
}

function correrShowdown(e: EstadoSalas): void {
  let guardia = 0;
  while (e.street !== "river" && guardia++ < 8) avanzarCalle(e);
  if (e.street === "river") advanceStreet(e);
  mostrarShowdown(e);
}

function mostrarShowdown(e: EstadoSalas): void {
  const resultados = showdown(e);
  e.showdownFinal = true;
  const partes = resultados.map((r) => {
    const nombres = r.winnerIds.map((id) => nombreDe(e, id)).join(" y ");
    return `${nombres} ${r.winnerIds.length > 1 ? "empatan" : "gana"} ${r.amount} con ${handName(
      r.category,
    )}`;
  });
  e.ganadorTexto = partes.length > 0 ? partes.join(" · ") : "Showdown.";
}

function ganarPorFold(e: EstadoSalas, ganador: PlayerState): void {
  refreshPot(e);
  ganador.stack += e.pot;
  e.winners = [ganador.id];
  e.street = "done";
  e.ganadorTexto = `${ganador.name} gana ${e.pot} sin mostrar cartas.`;
}

function nombreDe(e: EstadoSalas, id: number): string {
  return e.players.find((p) => p.id === id)?.name ?? `Asiento ${id + 1}`;
}

function legales(e: EstadoSalas, p: PlayerState): BrainLegal {
  const toCall = Math.max(0, e.currentBet - p.bet);
  const candidates: BrainAction[] = [];
  if (toCall > 0) candidates.push({ type: "fold" });
  else candidates.push({ type: "check" });
  if (toCall > 0 && p.stack > toCall) candidates.push({ type: "call" });
  if (p.bet + p.stack > e.currentBet) candidates.push({ type: "raise" });
  if (p.stack > 0) candidates.push({ type: "allin" });
  return { candidates, toCall, pot: e.pot, stack: p.stack };
}

function contexto(e: EstadoSalas, p: PlayerState): BrainContext {
  const rivales = e.players.filter((x) => !x.folded && x.id !== p.id).length;
  return {
    street: e.street,
    boardLen: e.board.length,
    myStack: p.stack,
    pot: e.pot,
    toCall: Math.max(0, e.currentBet - p.bet),
    numRivales: rivales,
  };
}

function cartaCorta(c: Card): string {
  return `${RANGOS[c.rank] ?? c.rank}${c.suit}`;
}

function resultadoDe(e: EstadoSalas): ResultadoMano {
  return {
    state: e,
    actingSeat: calcularActingSeat(e),
    handOver: e.iniciada === true && e.street === "done",
    winnerText: e.ganadorTexto,
  };
}

function okSala(room: Room): ResultadoSala {
  return { ...resultadoDe(estadoDe(room)), ok: true, agentLesson: room.lesson };
}

function fallo(e: EstadoSalas, error: string): ResultadoSala {
  return { ...resultadoDe(e), ok: false, error };
}
