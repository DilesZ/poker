// Lógica compartida de /api/rooms/*: la usan las rutas [code] y sus alias
// (state, action, leave). Valida en el interior del mutador y mapea errores
// 404 (sala/estancia), 409 (turno o conflicto de versión) y 400 (datos).
import { createBrain } from "../agent/brain";
import type { AccionSala } from "./roomEngine";
import {
  calcularActingSeat,
  construirVista,
  enJuego,
  estadoDe,
  ejecutarAccion,
  iniciarMano,
  initRoomState,
  jugarAgente,
  minimoJugadores,
  podar,
  reflejar,
  resolverCierre,
} from "./roomEngine";
import { actualizarSala, cargarSala, guardarSala, modificarSala } from "./store";
import type { Room, RoomPlayer } from "./types";
import { CLIENTE_AGENTE, NOMBRE_AGENTE, STACK_INICIAL } from "./types";

const ALFABETO = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const LARGO_CODIGO = 6;
const RESERVADOS = new Set(["STATE", "JOIN", "ACTION", "LEAVE", "ROOMS"]);
const PATRON_CODIGO = /^[A-Z0-9]{1,12}$/;
const TIPOS_ACCION = new Set([
  "fold",
  "check",
  "call",
  "raise",
  "allin",
  "nextStreet",
]);
const SIN_CACHE = { "cache-control": "no-store" };

/** Cuerpo JSON de la petición; null si falta o no es un objeto. */
export async function leerCuerpo(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const bruto: unknown = await req.json();
    return bruto && typeof bruto === "object" && !Array.isArray(bruto)
      ? (bruto as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Normaliza un código de sala a mayúsculas; null si no es usable. */
export function codigoDe(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const code = valor.trim().toUpperCase();
  return PATRON_CODIGO.test(code) ? code : null;
}

/** POST /api/rooms — crea la sala con el agente ya sentado. */
export async function crearSala(cuerpo: Record<string, unknown> | null): Promise<Response> {
  if (!cuerpo) return error(400, "Falta el cuerpo de la petición.");
  const nombre = textoLimpio(cuerpo.name);
  if (!nombre) return error(400, "Falta tu nombre.");
  const modo = cuerpo.mode;
  if (modo !== "1v1" && modo !== "multi") return error(400, "Modo de sala no válido.");
  const maxJugadores =
    modo === "1v1"
      ? 2
      : limitar(entero(cuerpo.maxPlayers) ?? 3, 3, 6);

  const code = await codigoLibre();
  const ahora = Date.now();
  const room: Room = {
    code,
    createdAt: ahora,
    players: [
      {
        clientId: CLIENTE_AGENTE,
        name: NOMBRE_AGENTE,
        seat: maxJugadores - 1,
        stack: STACK_INICIAL,
        connected: true,
      },
    ],
    withAgent: true,
    maxPlayers: maxJugadores,
    agentSeat: maxJugadores - 1,
    state: initRoomState(maxJugadores, true),
    version: 1,
    updatedAt: ahora,
    brain: createBrain(),
  };
  await guardarSala(room);
  return Response.json({ code }, { headers: SIN_CACHE });
}

/** POST /api/rooms/join — sienta al jugador (y arranca la primera mano). */
export async function unirseSala(cuerpo: Record<string, unknown> | null): Promise<Response> {
  if (!cuerpo) return error(400, "Falta el cuerpo de la petición.");
  const code = codigoDe(cuerpo.code);
  const nombre = textoLimpio(cuerpo.name);
  if (!code) return error(400, "Código de sala no válido.");
  if (!nombre) return error(400, "Falta tu nombre.");

  const errorInterno = { codigo: 400, mensaje: "" };
  const sentado = { clientId: "", seat: -1 };
  const r = await modificarSala(code, (room) => {
    if (room.players.length >= room.maxPlayers) {
      errorInterno.codigo = 409;
      errorInterno.mensaje = "La sala está llena.";
      return null;
    }
    const asiento = asientoLibre(room);
    if (asiento < 0) {
      errorInterno.codigo = 409;
      errorInterno.mensaje = "La sala está llena.";
      return null;
    }
    const jugador: RoomPlayer = {
      clientId: crypto.randomUUID(),
      name: nombre,
      seat: asiento,
      stack: STACK_INICIAL,
      connected: true,
    };
    room.players.push(jugador);
    sentado.clientId = jugador.clientId;
    sentado.seat = asiento;

    const estado = estadoDe(room);
    if (enJuego(room) && !estado.players.some((p) => p.id === asiento)) {
      // En mitad de una mano entra como espectador con la mano marcada como perdida.
      estado.players.push({
        id: asiento,
        name: nombre,
        stack: STACK_INICIAL,
        bet: 0,
        folded: true,
        allIn: false,
        hole: [],
        isHero: false,
      });
    }
    podar(room);
    if (estado.iniciada !== true && room.players.length >= minimoJugadores(room.maxPlayers)) {
      iniciarMano(room);
      jugarAgente(room);
      reflejar(room);
    }
    return room;
  });

  if (r.estado === "sin-sala") return error(404, "Sala no encontrada.");
  if (r.estado === "rechazado") return error(errorInterno.codigo, errorInterno.mensaje);
  return Response.json(
    { clientId: sentado.clientId, name: nombre, seat: sentado.seat },
    { headers: SIN_CACHE },
  );
}

/** GET /api/rooms/{code} — estado (204 si no cambió desde la versión pedida). */
export async function respuestaEstado(code: string | null, url: URL): Promise<Response> {
  if (!code) return error(404, "Sala no encontrada.");
  let room = await cargarSala(code);
  if (!room) return error(404, "Sala no encontrada.");

  const clientId = url.searchParams.get("clientId")?.trim() || undefined;
  const versionPedida = Number(url.searchParams.get("version") ?? "0");

  // Primera mano: arranca en cuanto hay gente suficiente.
  if (estadoDe(room).iniciada !== true && room.players.length >= minimoJugadores(room.maxPlayers)) {
    const arranque = await modificarSala(code, (sala) => {
      if (estadoDe(sala).iniciada === true) return null;
      iniciarMano(sala);
      return sala;
    });
    if (arranque.estado === "ok") room = arranque.room;
  }

  // Turno del agente: juega y reflexiona dentro de un solo CAS.
  const estado = estadoDe(room);
  const leToca =
    enJuego(room) && calcularActingSeat(estado) === room.agentSeat;
  if (leToca) {
    const jugada = await actualizarSala(code, room.version, (sala) => {
      jugarAgente(sala);
      reflejar(sala);
      return sala;
    });
    if (jugada.estado === "ok") room = jugada.room;
  }

  if (Number.isFinite(versionPedida) && room.version === versionPedida) {
    return new Response(null, { status: 204, headers: SIN_CACHE });
  }
  return Response.json(construirVista(room, clientId), { headers: SIN_CACHE });
}

/** POST /api/rooms/{code}/action — acción del jugador + turno del agente. */
export async function respuestaAccion(
  code: string | null,
  cuerpo: Record<string, unknown> | null,
): Promise<Response> {
  if (!code) return error(404, "Sala no encontrada.");
  if (!cuerpo) return error(400, "Falta el cuerpo de la petición.");
  const clientId = textoLimpio(cuerpo.clientId);
  const accion = leerAccion(cuerpo.action);
  if (!clientId) return error(400, "Falta tu identificador de sala.");
  if (clientId === CLIENTE_AGENTE) return error(403, "El agente no actúa por la API.");
  if (!accion) return error(400, "Acción no válida.");

  const room0 = await cargarSala(code);
  if (!room0) return error(404, "Sala no encontrada.");
  if (!room0.players.some((p) => p.clientId === clientId)) {
    return error(404, "No estás en esta sala.");
  }

  const fallo = { codigo: 400, mensaje: "" };
  const r = await actualizarSala(code, room0.version, (room) => {
    const jugador = room.players.find((p) => p.clientId === clientId);
    if (!jugador) {
      fallo.codigo = 404;
      fallo.mensaje = "No estás en esta sala.";
      return null;
    }
    const res = ejecutarAccion(room, jugador.seat, accion);
    if (!res.ok) {
      fallo.codigo = 409;
      fallo.mensaje = res.error ?? "Acción rechazada.";
      return null;
    }
    return room;
  });
  if (r.estado === "sin-sala") return error(404, "Sala no encontrada.");
  if (r.estado === "conflicto") return error(409, "La sala cambió; vuelve a intentarlo.");
  if (r.estado === "rechazado") return error(fallo.codigo, fallo.mensaje);
  return Response.json(construirVista(r.room, clientId), { headers: SIN_CACHE });
}

/** POST /api/rooms/{code}/leave — retira al jugador y resuelve su mano. */
export async function respuestaSalir(
  code: string | null,
  cuerpo: Record<string, unknown> | null,
): Promise<Response> {
  if (!code) return error(404, "Sala no encontrada.");
  if (!cuerpo) return error(400, "Falta el cuerpo de la petición.");
  const clientId = textoLimpio(cuerpo.clientId);
  if (!clientId) return error(400, "Falta tu identificador de sala.");
  if (clientId === CLIENTE_AGENTE) return error(403, "El agente no puede salir.");

  const room0 = await cargarSala(code);
  if (!room0) return error(404, "Sala no encontrada.");
  if (!room0.players.some((p) => p.clientId === clientId)) {
    return error(404, "No estás en esta sala.");
  }

  const fallo = { codigo: 400, mensaje: "" };
  const r = await actualizarSala(code, room0.version, (room) => {
    const indice = room.players.findIndex((p) => p.clientId === clientId);
    if (indice < 0) {
      fallo.codigo = 404;
      fallo.mensaje = "No estás en esta sala.";
      return null;
    }
    const saliente = room.players[indice] as RoomPlayer;
    room.players.splice(indice, 1);
    const estado = estadoDe(room);
    if (enJuego(room)) {
      const enMesa = estado.players.find((p) => p.id === saliente.seat);
      if (enMesa && !enMesa.folded) {
        enMesa.folded = true;
        resolverCierre(estado);
      }
    }
    podar(room);
    reflejar(room);
    return room;
  });
  if (r.estado === "sin-sala") return error(404, "Sala no encontrada.");
  if (r.estado === "conflicto") return error(409, "La sala cambió; vuelve a intentarlo.");
  if (r.estado === "rechazado") return error(fallo.codigo, fallo.mensaje);
  return Response.json({ ok: true }, { headers: SIN_CACHE });
}

function leerAccion(bruto: unknown): AccionSala | null {
  if (!bruto || typeof bruto !== "object") return null;
  const { type, size } = bruto as { type?: unknown; size?: unknown };
  if (typeof type !== "string" || !TIPOS_ACCION.has(type)) return null;
  if (type === "nextStreet") return { type: "nextStreet" };
  if (size === undefined) return { type: type as AccionSala["type"] };
  if (typeof size !== "number" || !Number.isFinite(size) || size < 1) return null;
  return { type: type as AccionSala["type"], size: Math.floor(size) };
}

async function codigoLibre(): Promise<string> {
  for (let intento = 0; intento < 100; intento++) {
    const bytes = new Uint8Array(LARGO_CODIGO);
    crypto.getRandomValues(bytes);
    let code = "";
    for (const b of bytes) code += ALFABETO[b % ALFABETO.length];
    if (RESERVADOS.has(code)) continue;
    if (!(await cargarSala(code))) return code;
  }
  return `${Date.now().toString(36).toUpperCase().slice(-LARGO_CODIGO)}`;
}

function asientoLibre(room: Room): number {
  const ocupados = new Set(room.players.map((p) => p.seat));
  for (let seat = 0; seat < room.maxPlayers; seat++) {
    if (!ocupados.has(seat)) return seat;
  }
  return -1;
}

function textoLimpio(bruto: unknown): string {
  return typeof bruto === "string" ? bruto.trim().slice(0, 40) : "";
}

function entero(bruto: unknown): number | null {
  return typeof bruto === "number" && Number.isFinite(bruto) ? Math.round(bruto) : null;
}

function limitar(valor: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, valor));
}

function error(codigo: number, mensaje: string): Response {
  return Response.json({ error: mensaje }, { status: codigo, headers: SIN_CACHE });
}
