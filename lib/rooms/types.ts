// Tipos de las salas privadas: jugador sentado, sala persistible y constantes.
import type { Brain } from "@/lib/agent/brain";
import type { GameState } from "@/lib/poker/types";

export interface RoomPlayer {
  clientId: string;
  name: string;
  seat: number;
  stack: number;
  connected: boolean;
}

export interface Room {
  code: string;
  createdAt: number;
  players: RoomPlayer[];
  withAgent: boolean;
  maxPlayers: number;
  agentSeat: number;
  state: GameState;
  version: number;
  updatedAt: number;
  brain: Brain;
  /** Última lección del agente (diario). Se limpia al repartir mano nueva. */
  lesson?: string;
  /** Versión de memoria global del agente (2 = con dream consolidation). */
  agentMemoryVersion?: number;
}

/** clientId fijo del agente: siempre sentado en su asiento. */
export const CLIENTE_AGENTE = "agente";
export const NOMBRE_AGENTE = "Agente";
export const STACK_INICIAL = 1000;
