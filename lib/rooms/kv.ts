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
    signal: AbortSignal.timeout(2000),
  });
}

async function pedirLectura(ruta: string): Promise<Response | null> {
  // Solo lectura: 1 reintento ante timeout/caída (la escritura no reintenta).
  for (let intento = 0; intento < 2; intento++) {
    try {
      const res = await pedir(ruta);
      return res;
    } catch {
      if (intento === 1) return null;
    }
  }
  return null;
}

export async function kvLeerJSON<T>(key: string): Promise<T | null> {
  const res = await pedirLectura(`/get/${encodeURIComponent(key)}`);
  if (!res || !res.ok) return null;
  let texto = "";
  try {
    const cuerpo = (await res.json()) as { result?: unknown };
    if (typeof cuerpo.result === "string") {
      texto = cuerpo.result;
    } else if (cuerpo.result === null || cuerpo.result === undefined) {
      return null;
    } else {
      // Upstash a veces devuelve el objeto ya parseado.
      return cuerpo.result as T;
    }
  } catch {
    return null;
  }
  if (!texto || texto === "null") return null;
  let valor: unknown;
  try {
    valor = JSON.parse(texto);
  } catch {
    return null;
  }
  if (Array.isArray(valor)) {
    // Escritura legada (el array de args se guardó como valor).
    const primero = valor[0];
    if (typeof primero !== "string") return null;
    try {
      valor = JSON.parse(primero);
    } catch {
      return null;
    }
  }
  if (valor === null || valor === undefined) return null;
  return valor as T;
}

export async function kvEscribirJSON(key: string, value: unknown, ttlSeg?: number): Promise<boolean> {
  const args: unknown[] =
    typeof ttlSeg === "number" && Number.isFinite(ttlSeg) && ttlSeg > 0
      ? ["SET", key, JSON.stringify(value), "EX", Math.floor(ttlSeg)]
      : ["SET", key, JSON.stringify(value)];
  const cuerpo = JSON.stringify(args);
  try {
    const res = await pedir("/", cuerpo);
    return res !== null && res.ok;
  } catch {
    return false;
  }
}

export async function kvLeer(code: string): Promise<Room | null> {
  const valor = await kvLeerJSON<unknown>(`${PREFIJO}${code}`);
  if (!valor || typeof valor !== "object") return null;
  const room = valor as Room;
  return typeof room.code === "string" ? room : null;
}

export async function kvEscribir(room: Room): Promise<boolean> {
  return kvEscribirJSON(`${PREFIJO}${room.code}`, room, TTL_SEGUNDOS);
}
