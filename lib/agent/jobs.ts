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

export interface EvalJob {
  id: string;
  status: "done" | "error";
  hands: number;
  bb100: number;
  sd: number;
  ci95: number;
  showdownPct: number;
  brainDecisions: number;
  seed: number;
  error?: string;
  startedAt: number;
  updatedAt: number;
}

const LATEST_KEY = "agent:train:latest";
const LATEST_EVAL_KEY = "agent:eval:latest";
const TTL_JOB = 7 * 24 * 3600;
const MEM_KEY = "__poker_train_latest__";
const MEM_EVAL_KEY = "__poker_eval_latest__";

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

function memoriaEval(): { job: EvalJob | null } {
  const g = globalThis as unknown as Record<string, unknown>;
  const h = g[MEM_EVAL_KEY] as { job: EvalJob | null } | undefined;
  if (h && typeof h === "object" && "job" in h) return h;
  const nuevo: { job: EvalJob | null } = { job: null };
  g[MEM_EVAL_KEY] = nuevo;
  return nuevo;
}

/** Limpia la última evaluación en memoria (solo tests). */
export function __clearEvalJob(): void {
  try {
    memoriaEval().job = null;
  } catch {
    // nunca lanza
  }
}

function clonarEval(j: EvalJob): EvalJob {
  return { ...j };
}

/** Guarda la última evaluación terminada. Nunca lanza. */
export async function recordEvalJob(job: EvalJob): Promise<void> {
  try {
    memoriaEval().job = clonarEval(job);
    if (kvConfigurado()) {
      try {
        await kvEscribirJSON(LATEST_EVAL_KEY, job, TTL_JOB);
      } catch {
        // best-effort
      }
    }
  } catch {
    // nunca lanza
  }
}

/** Lee la última evaluación (KV → memoria). Null si nunca hubo. Nunca lanza. */
export async function loadLatestEvalJob(): Promise<EvalJob | null> {
  try {
    if (kvConfigurado()) {
      try {
        const raw = await kvLeerJSON<EvalJob>(LATEST_EVAL_KEY);
        if (raw && typeof raw === "object" && typeof (raw as EvalJob).updatedAt === "number") {
          memoriaEval().job = clonarEval(raw as EvalJob);
          return clonarEval(raw as EvalJob);
        }
      } catch {
        // cae a memoria
      }
    }
    const mem = memoriaEval().job;
    return mem ? clonarEval(mem) : null;
  } catch {
    return null;
  }
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
