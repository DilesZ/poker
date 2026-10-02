// Cerebro global en servidor (Upstash KV + caché de proceso).
// Solo servidor: sin acceso a navegador. Nunca lanza (best-effort).
import { createBrain, type Brain } from "./memory";
import { loadGlobalBrain, mergeBrains, migrateBrain, saveGlobalBrain } from "./memory";
import { kvConfigurado, kvEscribirJSON, kvLeerJSON } from "../rooms/kv";

export const GLOBAL_BRAIN_KEY = "agent:global:brain:v3";
export const TTL_GLOBAL = 30 * 24 * 3600;

const SERVER_CACHE_KEY = "__poker_server_brain_v3__";
const MAX_PRIORS_SERVER = 600;
const MAX_LESSONS_SERVER = 100;

type ConMeta = Brain & { updatedAt?: number };

function serverHolder(): { current: ConMeta | null } {
  const g = globalThis as unknown as Record<string, unknown>;
  const h = g[SERVER_CACHE_KEY] as { current: ConMeta | null } | undefined;
  if (h && typeof h === "object" && "current" in h) return h;
  const nuevo: { current: ConMeta | null } = { current: null };
  g[SERVER_CACHE_KEY] = nuevo;
  return nuevo;
}

/** Limpia la caché de proceso del servidor (solo tests). */
export function __clearServerCache(): void {
  try {
    serverHolder().current = null;
  } catch {
    // nunca lanza
  }
}

function clonar(b: Brain): Brain {
  const c: Record<string, unknown> = {
    handsPlayed: b.handsPlayed,
    lessons: [...(b.lessons ?? [])],
    priors: { ...(b.priors ?? {}) },
    beliefs: [...(b.beliefs ?? [])],
    epsilon: b.epsilon,
    counts: { ...(b.counts ?? {}) },
  };
  // ConMeta.updatedAt no está en Brain: se conserva si venía (lo lee el panel).
  const u = (b as unknown as Record<string, unknown>).updatedAt;
  if (typeof u === "number" && Number.isFinite(u)) c.updatedAt = u;
  return c as unknown as Brain;
}

function conUpdatedAt(b: Brain, ts: number): ConMeta {
  const c = clonar(b) as ConMeta;
  c.updatedAt = ts;
  return c;
}

function capar(brain: Brain): Brain {
  const lessons = (brain.lessons ?? []).slice(-MAX_LESSONS_SERVER);
  let entries = Object.entries(brain.priors ?? {});
  if (entries.length > MAX_PRIORS_SERVER) {
    entries.sort((a, b) => Math.abs(a[1] - 0.5) - Math.abs(b[1] - 0.5));
    entries = entries.slice(entries.length - MAX_PRIORS_SERVER);
  }
  const priors: Record<string, number> = {};
  for (const [k, v] of entries) priors[k] = v;
  return {
    ...brain,
    lessons: [...lessons],
    priors,
    beliefs: [...(brain.beliefs ?? [])],
    counts: { ...(brain.counts ?? {}) },
  };
}

/** Lee el cerebro global: KV → migrate → caché proceso. Null si no hay. Nunca lanza. */
export async function loadGlobalBrainServer(): Promise<Brain | null> {
  try {
    if (kvConfigurado()) {
      try {
        const raw = await kvLeerJSON<unknown>(GLOBAL_BRAIN_KEY);
        if (raw !== null && raw !== undefined) {
          const migrado = migrateBrain(raw);
          let ts: number | undefined;
          if (raw && typeof raw === "object" && !Array.isArray(raw)) {
            const u = (raw as Record<string, unknown>).updatedAt;
            if (typeof u === "number" && Number.isFinite(u)) ts = u;
          }
          const conMeta = (migrado as ConMeta);
          if (ts !== undefined) conMeta.updatedAt = ts;
          serverHolder().current = conMeta;
          try {
            saveGlobalBrain(migrado);
          } catch {
            // best-effort
          }
          return clonar(migrado);
        }
      } catch {
        // cae a caché
      }
    }
    const cached = serverHolder().current;
    if (cached) return clonar(cached);
    try {
      const mem = loadGlobalBrain();
      if (mem) {
        serverHolder().current = mem as ConMeta;
        return clonar(mem);
      }
    } catch {
      // best-effort
    }
    return serverHolder().current ? clonar(serverHolder().current as Brain) : null;
  } catch {
    return null;
  }
}

/** Guarda el cerebro global (capa + updatedAt, best-effort). Nunca lanza. */
export async function saveGlobalBrainServer(brain: Brain): Promise<boolean> {
  try {
    const base = brain && typeof brain === "object" ? brain : createBrain();
    const capado = capar(base);
    const payload = conUpdatedAt(capado, Date.now());
    serverHolder().current = payload;
    try {
      saveGlobalBrain(capado);
    } catch {
      // best-effort
    }
    try {
      await kvEscribirJSON(GLOBAL_BRAIN_KEY, payload, TTL_GLOBAL);
    } catch {
      // KV best-effort: la caché ya vale
    }
    return true;
  } catch {
    return false;
  }
}

/** Fusiona sala → global y persiste. Si no hay global, guarda la sala tal cual. Nunca lanza. */
export async function mergeAndSaveServer(roomBrain: Brain): Promise<Brain> {
  try {
    const previo = await loadGlobalBrainServer();
    if (!previo) {
      const fallback = roomBrain && typeof roomBrain === "object" ? roomBrain : createBrain();
      await saveGlobalBrainServer(fallback);
      return clonar(fallback);
    }
    const room = roomBrain && typeof roomBrain === "object" ? roomBrain : createBrain();
    const merged = mergeBrains(previo, room);
    await saveGlobalBrainServer(merged);
    return clonar(merged);
  } catch {
    try {
      return clonar(roomBrain);
    } catch {
      return createBrain();
    }
  }
}
