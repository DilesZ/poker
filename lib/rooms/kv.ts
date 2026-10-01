// Persistencia opcional en Upstash Redis por REST (Vercel KV / Marketplace).
// Acepta KV_REST_API_* (Vercel KV clásico) o UPSTASH_REDIS_REST_* (Marketplace).
// Sin esas env queda desactivada y manda la memoria.
import type { Room } from "./types";

const PREFIJO = "room:";
const TTL_SEGUNDOS = 24 * 60 * 60;

function primeraEnv(...nombres: string[]): string | null {
  for (const nombre of nombres) {
    const valor = process.env[nombre];
    if (valor && valor.trim()) return valor.trim();
  }
  return null;
}

function base(): string | null {
  const url = primeraEnv("KV_REST_API_URL", "UPSTASH_REDIS_REST_URL");
  return url ? url.replace(/\/+$/, "") : null;
}

function token(): string | null {
  return primeraEnv("KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_TOKEN");
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
