// Fachada de persistencia de salas: memoria en proceso (+ KV REST si hay env).
// `actualizarSala` hace CAS por versión con reintentos; `modificarSala` es la
// variante sin versión conocida (alta de sala, unión) con lectura-escritura directa.
import { kvConfigurado, kvEscribir, kvLeer } from "./kv";
import { memoriaEscribir, memoriaLeer } from "./memory";
import type { Room } from "./types";

export type Actualizacion =
  | { estado: "ok"; room: Room }
  | { estado: "sin-sala" }
  | { estado: "rechazado" }
  | { estado: "conflicto" };

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
export async function modificarSala(
  code: string,
  mutador: (room: Room) => Room | null,
): Promise<Actualizacion> {
  const room = await cargarSala(code);
  if (!room) return { estado: "sin-sala" };
  const mutado = mutador(room);
  if (!mutado) return { estado: "rechazado" };
  await guardarSala(sellar(mutado, room.version + 1));
  return { estado: "ok", room: mutado };
}

function sellar(room: Room, version: number): Room {
  room.version = version;
  room.updatedAt = Date.now();
  return room;
}
