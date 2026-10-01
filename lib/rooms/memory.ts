// Almacenamiento en memoria del proceso: Map global con TTL de 24 h.
// Sirve sin configuración y como respaldo si el KV REST falla.
import type { Room } from "./types";

const CLAVE_GLOBAL = "__salasMemoria";
const TTL_MS = 24 * 60 * 60 * 1000;

interface Entrada {
  room: Room;
  expira: number;
}

interface ConMemoria {
  [CLAVE_GLOBAL]?: Map<string, Entrada>;
}

function mapa(): Map<string, Entrada> {
  const g = globalThis as ConMemoria;
  g[CLAVE_GLOBAL] ??= new Map<string, Entrada>();
  return g[CLAVE_GLOBAL] as Map<string, Entrada>;
}

function clonar(room: Room): Room {
  return JSON.parse(JSON.stringify(room)) as Room;
}

export function memoriaLeer(code: string): Room | null {
  const entrada = mapa().get(code);
  if (!entrada) return null;
  if (entrada.expira < Date.now()) {
    mapa().delete(code);
    return null;
  }
  return clonar(entrada.room);
}

export function memoriaEscribir(room: Room): void {
  mapa().set(room.code, { room: clonar(room), expira: Date.now() + TTL_MS });
}

export function memoriaLimpiar(): void {
  mapa().clear();
}
