// Cliente de salas privadas — STUB con el contrato fijo consumido por app/salas/*.
// Otro agente sobrescribirá este archivo con la implementación real; mientras tanto
// llama a /api/rooms/* y lanza un error claro cuando la API aún no exista.

export interface RoomPlayer {
  clientId: string;
  name: string;
  seat: number;
  stack: number;
  connected: boolean;
}

export interface RoomView {
  code: string;
  players: RoomPlayer[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  state: any;
  version: number;
  myHole?: { rank: number; suit: string }[];
  agentLesson?: string;
  yourSeat?: number;
  actingSeat?: number;
  handOver?: boolean;
  winnerText?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  brainMeta?: any;
}

const BASE = "/api/rooms";

async function llamar(ruta: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(`${BASE}${ruta}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    throw new Error(
      "El servicio de salas no responde: falta la API /api/rooms en este despliegue.",
    );
  }
}

async function cuerpo(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

function fallar(res: Response, texto: string): never {
  const detalle = texto ? `: ${texto.slice(0, 200)}` : "";
  throw new Error(`El servicio de salas respondió ${res.status}${detalle}`);
}

async function json<T>(res: Response, texto: string): Promise<T> {
  if (!res.ok) fallar(res, texto);
  if (!texto.trim()) fallar(res, "respuesta vacía");
  try {
    return JSON.parse(texto) as T;
  } catch {
    throw new Error("El servicio de salas devolvió una respuesta ilegible.");
  }
}

export function createRoom(
  name: string,
  mode: "1v1" | "multi",
  maxPlayers: number,
): Promise<{ code: string }> {
  return llamar("", {
    method: "POST",
    body: JSON.stringify({ name, mode, maxPlayers }),
  }).then(async (res) => json<{ code: string }>(res, await cuerpo(res)));
}

export function joinRoom(
  code: string,
  name: string,
): Promise<{ clientId: string; name: string; seat: number }> {
  return llamar("/join", {
    method: "POST",
    body: JSON.stringify({ code, name }),
  }).then(async (res) =>
    json<{ clientId: string; name: string; seat: number }>(
      res,
      await cuerpo(res),
    ),
  );
}

export async function fetchState(
  code: string,
  clientId: string,
  version: number,
): Promise<RoomView | null> {
  const res = await llamar(
    `/${encodeURIComponent(code)}?clientId=${encodeURIComponent(clientId)}&version=${version}`,
  );
  if (res.status === 204) return null;
  const texto = await cuerpo(res);
  if (!res.ok) fallar(res, texto);
  if (!texto.trim()) return null;
  try {
    return (JSON.parse(texto) as RoomView | null) ?? null;
  } catch {
    throw new Error("El estado de la sala es ilegible.");
  }
}

export function sendAction(
  code: string,
  clientId: string,
  action: {
    type: "fold" | "check" | "call" | "raise" | "allin" | "nextStreet";
    size?: number;
  },
): Promise<RoomView> {
  return llamar(`/${encodeURIComponent(code)}/action`, {
    method: "POST",
    body: JSON.stringify({ clientId, action }),
  }).then(async (res) => json<RoomView>(res, await cuerpo(res)));
}

export async function leaveRoom(
  code: string,
  clientId: string,
): Promise<void> {
  const res = await llamar(`/${encodeURIComponent(code)}/leave`, {
    method: "POST",
    body: JSON.stringify({ clientId }),
  });
  if (!res.ok) fallar(res, await cuerpo(res));
}
