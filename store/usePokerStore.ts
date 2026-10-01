import { create } from "zustand";
import { getAiAction } from "../lib/poker/ai";
import { CATEGORY_NAMES } from "../lib/poker/evaluator";
import {
  advanceStreet,
  deal,
  newHand,
  postBlinds,
  refreshPot,
  showdown,
} from "../lib/poker/game";
import type { Card, GameState } from "../lib/poker/types";
import {
  loadRegistro,
  registrarResultado,
  registroVacio,
  resetRegistro as clearRegistro,
  saveRegistro,
  type ErrorTag,
  type RegistroManos,
  type ResultadoMano,
} from "../lib/stats";

const NUM_PLAYERS = 6;
const STARTING_STACK = 1000;
const SMALL_BLIND = 10;
const BIG_BLIND = 20;
const MAX_LOG = 200;

interface PokerStore {
  game: GameState | null;
  log: string[];
  stats: RegistroManos;
  statsLoaded: boolean;
  /** Último botón usado (rota cada mano). */
  button: number;
  raiseAmount: number;
  lastResult: ResultadoMano | null;
  setRaiseAmount: (n: number) => void;
  hydrateStats: () => void;
  startHand: () => void;
  heroFold: () => void;
  heroCallOrCheck: () => void;
  heroBet: () => void;
  nextStreet: () => void;
  tagError: (tag: ErrorTag) => void;
  resetStats: () => void;
}

/** Clon inmutable para que React detecte el cambio de estado. */
function cloneGame(g: GameState): GameState {
  return {
    ...g,
    players: g.players.map((p) => ({ ...p, hole: [...p.hole] })),
    board: [...g.board],
    deck: [...g.deck],
    sidePots: g.sidePots.map((s) => ({ ...s, eligible: [...s.eligible] })),
    winners: g.winners ? [...g.winners] : undefined,
  };
}

/** Fichas que debe igualar el jugador `id` para ver la apuesta. */
export function toCallFor(g: GameState, id: number): number {
  const p = g.players[id];
  if (!p || p.folded || p.allIn) return 0;
  return Math.max(0, g.currentBet - p.bet);
}

function activeVillains(g: GameState): number {
  return g.players.filter((p) => p.id !== 0 && !p.folded).length;
}

function cardName(c: Card): string {
  const r =
    c.rank === 14
      ? "A"
      : c.rank === 13
        ? "K"
        : c.rank === 12
          ? "Q"
          : c.rank === 11
            ? "J"
            : `${c.rank}`;
  return `${r}${c.suit}`;
}

function winnerLabel(g: GameState, ids: number[]): string {
  return ids.map((id) => g.players[id]?.name ?? `#${id}`).join(", ");
}

/** Los 5 villanos responden con la IA heurística. Mutación sobre `g`. */
function playVillains(g: GameState, log: string[]): void {
  for (const v of g.players) {
    if (v.id === 0 || v.folded || v.allIn) continue;
    const call = Math.max(0, g.currentBet - v.bet);
    // Fuerza sintética: la IA real evaluaría su mano contra la mesa.
    const strength = 0.25 + Math.random() * 0.6;
    const decision = getAiAction(strength, call, g.pot, v.stack, BIG_BLIND);
    if (decision.action === "fold") {
      v.folded = true;
      log.push(`${v.name} foldea.`);
    } else if (decision.action === "check") {
      log.push(`${v.name} pasa.`);
    } else if (decision.action === "call") {
      const pay = Math.min(v.stack, decision.amount);
      v.stack -= pay;
      v.bet += pay;
      if (v.stack === 0) v.allIn = true;
      log.push(`${v.name} iguala ${pay}.`);
    } else if (decision.action === "bet") {
      const pay = Math.min(v.stack, call + decision.amount);
      v.stack -= pay;
      v.bet += pay;
      if (v.stack === 0) v.allIn = true;
      log.push(`${v.name} sube a ${v.bet} (+${pay}).`);
    } else {
      const pay = v.stack;
      v.stack = 0;
      v.bet += pay;
      v.allIn = true;
      log.push(`${v.name} va ALL-IN (${v.bet}).`);
    }
  }
  refreshPot(g);
  g.currentBet = Math.max(0, ...g.players.map((p) => p.bet));
}

/** Hero gana porque todos foldearon. Mutación sobre `g`. */
function heroTakesPot(g: GameState, log: string[]): void {
  const hero = g.players[0];
  if (!hero) return;
  log.push(`Todos foldean. Hero gana el bote (${g.pot}).`);
  hero.stack += g.pot;
  for (const p of g.players) p.bet = 0;
  refreshPot(g);
  g.street = "done";
  g.winners = [0];
}

function commitResult(
  prev: RegistroManos,
  resultado: ResultadoMano,
  heroBet: number,
): RegistroManos {
  const next = registrarResultado(prev, resultado, {
    hizoVpip: heroBet > BIG_BLIND,
  });
  saveRegistro(next);
  return next;
}

export const usePokerStore = create<PokerStore>()((set, get) => ({
  game: null,
  log: [],
  stats: registroVacio,
  statsLoaded: false,
  button: 0,
  raiseAmount: 60,
  lastResult: null,

  setRaiseAmount: (n: number) => {
    const safe = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
    set({ raiseAmount: safe });
  },

  hydrateStats: () => {
    if (get().statsLoaded) return;
    set({ stats: loadRegistro(), statsLoaded: true });
  },

  startHand: () => {
    const prev = get().game;
    const carried = prev?.players.map((p) =>
      p.stack <= 0 ? STARTING_STACK : p.stack,
    );
    const button = prev ? (get().button + 1) % NUM_PLAYERS : 0;
    const g = newHand(
      NUM_PLAYERS,
      STARTING_STACK,
      SMALL_BLIND,
      BIG_BLIND,
      button,
    );
    if (carried) {
      g.players.forEach((p, i) => {
        const s = carried[i] ?? STARTING_STACK;
        p.stack = s <= 0 ? STARTING_STACK : s;
      });
    }
    postBlinds(g);
    deal(g);
    const nextLog = [
      ...get().log,
      `—— Nueva mano (botón: ${g.players[button]?.name ?? button}) ——`,
      `Ciegas ${SMALL_BLIND}/${BIG_BLIND}. Repartidas 2 cartas a cada jugador.`,
    ];
    set({
      game: g,
      log: nextLog.slice(-MAX_LOG),
      button,
      lastResult: null,
    });
  },

  heroFold: () => {
    const { game, log, stats } = get();
    if (!game) return;
    const hero = game.players[0];
    if (!hero || hero.folded || game.street === "done") return;
    const g = cloneGame(game);
    const h = g.players[0];
    if (!h) return;
    const heroBet = h.bet;
    h.folded = true;
    const nextLog = [...log, "Hero foldea."];
    // La mano continúa entre villanos: algún fold, calles al instante y showdown.
    if (activeVillains(g) > 2) {
      for (const v of g.players) {
        if (
          v.id !== 0 &&
          !v.folded &&
          !v.allIn &&
          activeVillains(g) > 2 &&
          Math.random() < 0.2
        ) {
          v.folded = true;
          nextLog.push(`${v.name} foldea.`);
        }
      }
    }
    while (g.board.length < 5) advanceStreet(g);
    const results = showdown(g);
    for (const r of results) {
      nextLog.push(
        `Bote ${r.amount}: gana ${winnerLabel(g, r.winnerIds)} con ${CATEGORY_NAMES[r.category] ?? r.category}.`,
      );
    }
    const endStats = commitResult(stats, "D", heroBet);
    for (const p of g.players) p.bet = 0;
    refreshPot(g);
    set({
      game: g,
      log: nextLog.slice(-MAX_LOG),
      stats: endStats,
      lastResult: "D",
    });
  },

  heroCallOrCheck: () => {
    const { game, log, stats } = get();
    if (!game) return;
    const hero = game.players[0];
    if (!hero || hero.folded || hero.allIn || game.street === "done") return;
    const g = cloneGame(game);
    const h = g.players[0];
    if (!h) return;
    const call = toCallFor(g, 0);
    const nextLog = [...log];
    if (call <= 0) {
      nextLog.push("Hero pasa.");
    } else {
      const pay = Math.min(h.stack, call);
      h.stack -= pay;
      h.bet += pay;
      if (h.stack === 0) h.allIn = true;
      nextLog.push(`Hero iguala ${pay}.`);
    }
    refreshPot(g);
    g.currentBet = Math.max(0, ...g.players.map((p) => p.bet));
    playVillains(g, nextLog);
    if (activeVillains(g) === 0) {
      heroTakesPot(g, nextLog);
      const endStats = commitResult(stats, "V", h.bet);
      set({
        game: g,
        log: nextLog.slice(-MAX_LOG),
        stats: endStats,
        lastResult: "V",
      });
      return;
    }
    set({ game: g, log: nextLog.slice(-MAX_LOG) });
  },

  heroBet: () => {
    const { game, log, stats } = get();
    if (!game) return;
    const hero = game.players[0];
    if (!hero || hero.folded || hero.allIn || game.street === "done") return;
    const g = cloneGame(game);
    const h = g.players[0];
    if (!h) return;
    const raise = Math.max(1, Math.floor(get().raiseAmount));
    const call = toCallFor(g, 0);
    const pay = Math.min(h.stack, call + raise);
    if (pay <= 0) return;
    h.stack -= pay;
    h.bet += pay;
    if (h.stack === 0) h.allIn = true;
    const nextLog = [...log, `Hero sube a ${h.bet} (+${pay}).`];
    refreshPot(g);
    g.currentBet = Math.max(0, ...g.players.map((p) => p.bet));
    playVillains(g, nextLog);
    if (activeVillains(g) === 0) {
      heroTakesPot(g, nextLog);
      const endStats = commitResult(stats, "V", h.bet);
      set({
        game: g,
        log: nextLog.slice(-MAX_LOG),
        stats: endStats,
        lastResult: "V",
      });
      return;
    }
    set({ game: g, log: nextLog.slice(-MAX_LOG) });
  },

  nextStreet: () => {
    const { game, log, stats } = get();
    if (!game || game.street === "done") return;
    const hero = game.players[0];
    if (!hero || hero.folded) return;
    const g = cloneGame(game);
    const nextLog = [...log];
    if (g.street === "river") {
      const heroBet = g.players[0]?.bet ?? 0;
      const results = showdown(g);
      for (const r of results) {
        nextLog.push(
          `Bote ${r.amount}: gana ${winnerLabel(g, r.winnerIds)} con ${CATEGORY_NAMES[r.category] ?? r.category}.`,
        );
      }
      const winners = g.winners ?? [];
      const resultado: ResultadoMano = winners.includes(0)
        ? winners.length > 1
          ? "E"
          : "V"
        : "D";
      const endStats = commitResult(stats, resultado, heroBet);
      for (const p of g.players) p.bet = 0;
      refreshPot(g);
      nextLog.push(
        resultado === "V"
          ? "¡Ganaste la mano!"
          : resultado === "E"
            ? "Empate: bote dividido."
            : "Perdiste la mano.",
      );
      set({
        game: g,
        log: nextLog.slice(-MAX_LOG),
        stats: endStats,
        lastResult: resultado,
      });
      return;
    }
    advanceStreet(g);
    nextLog.push(
      `—— ${g.street.toUpperCase()} —— ${g.board.map(cardName).join(" ")}`,
    );
    set({ game: g, log: nextLog.slice(-MAX_LOG) });
  },

  tagError: (tag: ErrorTag) => {
    const stats = get().stats;
    const next: RegistroManos = {
      ...stats,
      errorTags: [...stats.errorTags, tag],
    };
    saveRegistro(next);
    set({
      stats: next,
      log: [...get().log, `Error etiquetado: ${tag}.`].slice(-MAX_LOG),
    });
  },

  resetStats: () => {
    const limpio = clearRegistro();
    set({
      stats: limpio,
      log: [...get().log, "Estadísticas reiniciadas."].slice(-MAX_LOG),
    });
  },
}));
