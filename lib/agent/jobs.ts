// Estado del último entrenamiento en servidor (KV + fallback memoria).
// Permite saber cuándo terminó un entrenamiento sin mantener la conexión abierta.
// Solo servidor. Nunca lanza.
import { kvConfigurado, kvEscribirJSON, kvLeerJSON } from "../rooms/kv";

export interface TrainJob {
  id: string;
  status: "done" | "error";
  requested: number;
  done: number;
  winrateBB100: number;
  showdownPct: number;
  handsPlayed: number;
  priorsMovidos?: number;
  error?: string;
  startedAt: number;
  updatedAt: number;
}

const LATEST_KEY = "agent:train:latest";
const TTL_JOB = 7 * 24 * 3600;
const MEM_KEY = "__poker_train_latest__";

function memoria(): { job: TrainJob | null } {
  const g = globalThis as unknown as Record<string, unknown>;
  const h = g[MEM_KEY] as { job: TrainJob | null } | undefined;
  if (h && typeof h === "object" && "job" in h) return h;
  const nuevo: { job: TrainJob | null } = { job: null };
  g[MEM_KEY] = nuevo;
  return nuevo;
}

/** Limpia el último job en memoria (solo tests). */
export function __clearTrainJob(): void {
  try {
    memoria().job = null;
  } catch {
    // nunca lanza
  }
}

function clonar(j: TrainJob): TrainJob {
  return { ...j };
}

/** Guarda el último entrenamiento terminado. Nunca lanza. */
export async function recordTrainJob(job: TrainJob): Promise<void> {
  try {
    memoria().job = clonar(job);
    if (kvConfigurado()) {
      try {
        await kvEscribirJSON(LATEST_KEY, job, TTL_JOB);
      } catch {
        // best-effort
      }
    }
  } catch {
    // nunca lanza
  }
}

/** Lee el último entrenamiento (KV → memoria). Null si nunca hubo. Nunca lanza. */
export async function loadLatestTrainJob(): Promise<TrainJob | null> {
  try {
    if (kvConfigurado()) {
      try {
        const raw = await kvLeerJSON<TrainJob>(LATEST_KEY);
        if (raw && typeof raw === "object" && typeof (raw as TrainJob).updatedAt === "number") {
          memoria().job = clonar(raw as TrainJob);
          return clonar(raw as TrainJob);
        }
      } catch {
        // cae a memoria
      }
    }
    const mem = memoria().job;
    return mem ? clonar(mem) : null;
  } catch {
    return null;
  }
}
