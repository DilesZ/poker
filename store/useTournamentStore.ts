import { create } from "zustand";
import { persist } from "zustand/middleware";
import { levelForHand } from "../lib/tournament/blinds";
import {
  NUM_PLAYERS,
  STARTING_CHIPS,
  nextEliminatedPlace,
  type Standing,
} from "../lib/tournament/structure";

interface TournamentStore {
  /** 6 jugadores con 1000 fichas; `place` null mientras siguen vivos. */
  players: Standing[];
  /** Manos jugadas (0-based: la próxima mano es handIndex + 1). */
  handIndex: number;
  /** Índice en LEVELS derivado de handIndex. */
  level: number;
  /** Orden de eliminación (playerIds, primero el 6.º). */
  eliminations: number[];
  /** Reinicia el SNG. */
  startSNG: () => void;
  /** Marca eliminado y asigna su puesto según vivos restantes. */
  recordElimination: (playerId: number) => void;
  /** Avanza una mano y sube el nivel cuando toca. */
  nextHand: () => void;
}

function freshPlayers(): Standing[] {
  return Array.from({ length: NUM_PLAYERS }, (_, i) => ({
    playerId: i,
    chips: STARTING_CHIPS,
    eliminated: false,
    place: null,
  }));
}

export const useTournamentStore = create<TournamentStore>()(
  persist(
    (set, get) => ({
      players: freshPlayers(),
      handIndex: 0,
      level: levelForHand(0),
      eliminations: [],

      startSNG: () =>
        set({
          players: freshPlayers(),
          handIndex: 0,
          level: levelForHand(0),
          eliminations: [],
        }),

      recordElimination: (playerId: number) => {
        const { players, eliminations } = get();
        const target = players.find((p) => p.playerId === playerId);
        if (!target || target.eliminated) return;
        const aliveCount = players.filter((p) => !p.eliminated).length;
        const place = nextEliminatedPlace(aliveCount);
        set({
          players: players.map((p) =>
            p.playerId === playerId
              ? { ...p, chips: 0, eliminated: true, place }
              : p,
          ),
          eliminations: [...eliminations, playerId],
        });
      },

      nextHand: () => {
        const handIndex = get().handIndex + 1;
        set({ handIndex, level: levelForHand(handIndex) });
      },
    }),
    { name: "poker-sng" },
  ),
);
