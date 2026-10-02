// Fachada de persistencia de salas: memoria en proceso (+ KV REST si hay env).
// `actualizarSala` hace CAS por versión con reintentos; `modificarSala` es la
// variante sin versión conocida con CAS optimista (lee versión, intenta
// actualizarSala, reintenta 3 veces).
import { kvConfigurado, kvEscribir, kvLeer } from "./kv";
import { memoriaEscribir, memoriaLeer } from "./memory";
import type { Room } from "./types";

export type Actualizacion =
  | { estado: "ok"; room: Room }
  | { estado: "sin-sala" }
  | { estado: "rechazado" }
  | { estado: "conflicto" };

/** Validador básico de forma de sala (code, players array, brain.priors). */
export function isRoomShape(valor: unknown): valor is Room {
  if (!valor || typeof valor !== "object") return false;
  const r = valor as Record<string, unknown>;
  if (typeof r.code !== "string" || r.code.length === 0) return false;
  if (!Array.isArray(r.players)) return false;
  const brain = r.brain as Record<string, unknown> | null | undefined;
  if (!brain || typeof brain !== "object") return false;
  const priors = (brain as Record<string, unknown>).priors;
  if (!priors || typeof priors !== "object" || Array.isArray(priors)) return false;
  return true;
}

export async function cargarSala(code: string): Promise<Room | null> {
  if (kvConfigurado()) {
    try {
      const room = await kvLeer(code);
      if (room) return room;
    } catch {
      // KV caído: seguimos con la memoria del proceso
    }
  }
  return memoriaLeer(code);
}

export async function guardarSala(room: Room): Promise<void> {
  memoriaEscribir(room);
  if (kvConfigurado()) {
    try {
      await kvEscribir(room);
    } catch {
      // el KV es mejor esfuerzo: la memoria sigue siendo válida en este proceso
    }
  }
}

/** Aplica el mutador si la versión sigue siendo la esperada; reintenta si cambió. */
export async function actualizarSala(
  code: string,
  esperada: number,
  mutador: (room: Room) => Room | null,
  reintentos = 4,
): Promise<Actualizacion> {
  let version = esperada;
  for (let intento = 0; intento < reintentos; intento++) {
    const room = await cargarSala(code);
    if (!room) return { estado: "sin-sala" };
    if (room.version !== version) {
      version = room.version;
      continue;
    }
    const mutado = mutador(room);
    if (!mutado) return { estado: "rechazado" };
    await guardarSala(sellar(mutado, version + 1));
    return { estado: "ok", room: mutado };
  }
  return { estado: "conflicto" };
}

/** Igual que actualizarSala sin versión previa: parte de la última leída. */
// CAS optimista: lee versión, intenta actualizarSala, reintenta 3 veces.
export async function modificarSala(
  code: string,
  mutador: (room: Room) => Room | null,
  reintentos = 3,
): Promise<Actualizacion> {
  for (let intento = 0; intento < reintentos; intento++) {
    const room = await cargarSala(code);
    if (!room) return { estado: "sin-sala" };
    if (!isRoomShape(room)) return { estado: "sin-sala" };
    const version = room.version;
    // Un solo intento por vuelta; si hay conflicto, relee y reintenta.
    const r = await actualizarSala(code, version, mutador, 1);
    if (r.estado === "conflicto") continue;
    // actualizarSala con reintentos=1 devuelve conflicto si la versión cambió
    // entre nuestra lectura y la suya; también puede devolver ok/rechazado/sin-sala.
    // Para el caso borde donde actualizarSala recargó y avanzó versión interna,
    // tratamos ok como éxito y cualquier otro como resultado final salvo conflicto.
    return r;
  }
  return { estado: "conflicto" };
}

function sellar(room: Room, version: number): Room {
  room.version = version;
  room.updatedAt = Date.now();
  return room;
}
