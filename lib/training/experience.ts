// Buffer de experiencia para training v0.2. Sin React. localStorage + fallback en memoria.
import type { TablePosition } from "./strategy";

/** Una muestra de self-play (una por mano, centrada en el héroe). */
export interface Experience {
  /** `${seed}:${handIndex}` — determinista y trazable. */
  handId: string;
  position: TablePosition;
  /** Última acción del héroe: fold | check | call | bet | all-in. */
  action: string;
  /** Beneficio del héroe en big blinds (puede ser negativo). */
  rewardBB: number;
}

export const EXPERIENCE_STORAGE_KEY = "poker-experience";
export const MAX_EXPERIENCES = 500;

let memoryBuffer: Experience[] | null = null;

function sanitize(e: unknown): Experience | null {
  if (typeof e !== "object" || e === null) return null;
  const r = e as Record<string, unknown>;
  if (typeof r["handId"] !== "string") return null;
  if (typeof r["position"] !== "string") return null;
  if (typeof r["action"] !== "string") return null;
  if (typeof r["rewardBB"] !== "number" || !Number.isFinite(r["rewardBB"] as number)) return null;
  return {
    handId: r["handId"] as string,
    position: r["position"] as TablePosition,
    action: r["action"] as string,
    rewardBB: r["rewardBB"] as number,
  };
}

function readStorage(): Experience[] {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(EXPERIENCE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: Experience[] = [];
    for (const item of parsed) {
      const s = sanitize(item);
      if (s) out.push(s);
    }
    return out.slice(-MAX_EXPERIENCES);
  } catch {
    return [];
  }
}

function writeStorage(list: Experience[]): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(EXPERIENCE_STORAGE_KEY, JSON.stringify(list));
    }
  } catch {
    // Best-effort: se conserva en memoria.
  }
}

/** Carga el buffer (memoria → localStorage → []). Nunca lanza. */
export function loadExperiences(): Experience[] {
  if (memoryBuffer) return [...memoryBuffer];
  const fromStorage = readStorage();
  memoryBuffer = [...fromStorage];
  return [...fromStorage];
}

/**
 * Añade una experiencia y recorta a las últimas 500.
 * Devuelve el buffer completo tras el append.
 */
export function appendExperience(e: Experience): Experience[] {
  const clean: Experience = {
    handId: e.handId,
    position: e.position,
    action: e.action,
    rewardBB: Number.isFinite(e.rewardBB) ? e.rewardBB : 0,
  };
  const current = loadExperiences();
  current.push(clean);
  const capped = current.slice(-MAX_EXPERIENCES);
  memoryBuffer = [...capped];
  writeStorage(capped);
  return [...capped];
}

/** Vacía el buffer (memoria + localStorage). */
export function clearExperiences(): void {
  memoryBuffer = [];
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(EXPERIENCE_STORAGE_KEY);
    }
  } catch {
    // Ignorar.
  }
}
