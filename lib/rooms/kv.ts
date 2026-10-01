// Persistencia opcional en Upstash Redis por REST (Vercel KV).
// Sin KV_REST_API_URL/KV_REST_API_TOKEN queda desactivada y manda la memoria.
import type { Room } from "./types";

const PREFIJO = "room:";
const TTL_SEGUNDOS = 24 * 60 * 60;

function base(): string | null {
  const url = process.env.KV_REST_API_URL;
  return url && url.trim() ? url.replace(/\/+$/, "") : null;
}

function token(): string | null {
  const valor = process.env.KV_REST_API_TOKEN;
  return valor && valor.trim() ? valor.trim() : null;
}

export function kvConfigurado(): boolean {
  return base() !== null && token() !== null;
}

async function pedir(ruta: string, cuerpo?: string): Promise<Response | null> {
  const url = base();
  const clave = token();
  if (!url || !clave) return null;
  return fetch(`${url}${ruta}`, {
    method: cuerpo === undefined ? "GET" : "POST",
    body: cuerpo,
    headers: {
      authorization: `Bearer ${clave}`,
      "content-type": "application/json",
    },
  });
}

export async function kvLeer(code: string): Promise<Room | null> {
  const res = await pedir(`/get/${PREFIJO}${encodeURIComponent(code)}`);
  if (!res || !res.ok) return null;
  const texto = (await res.text()).trim();
  if (!texto || texto === "null") return null;
  let valor: unknown;
  try {
    valor = JSON.parse(texto);
  } catch {
    return null;
  }
  if (typeof valor !== "string" || !valor) return null;
  try {
    return JSON.parse(valor) as Room;
  } catch {
    return null;
  }
}

export async function kvEscribir(room: Room): Promise<boolean> {
  const cuerpo = JSON.stringify([JSON.stringify(room), "EX", TTL_SEGUNDOS]);
  const res = await pedir(`/set/${PREFIJO}${room.code}`, cuerpo);
  return res !== null && res.ok;
}
