// Memoria del agente en proceso: sin persistencia de navegador.
// Solo proceso (holder en globalThis) + migrate + merge. Nunca lanza.
import { createBrain, type Brain } from "./brain";

export { createBrain };
export type { Brain };

const MAX_PRIORS = 500;
const MAX_LESSONS = 100;
const MAX_HANDS = 100000;
const PRIOR_MIN = 0.05;
const PRIOR_MAX = 0.95;

const CACHE_KEY = "__poker_brain_cache_v3__";

function holder(): { current: Brain | null } {
  const g = globalThis as unknown as Record<string, unknown>;
  const h = g[CACHE_KEY] as { current: Brain | null } | undefined;
  if (h && typeof h === "object" && "current" in h) return h;
  const nuevo: { current: Brain | null } = { current: null };
  g[CACHE_KEY] = nuevo;
  return nuevo;
}

/** Limpia la caché en memoria (solo tests). */
export function __clearGlobalCache(): void {
  try {
    holder().current = null;
  } catch {
    // nunca lanza
  }
}

/** Migra cualquier objeto con priors a un Brain completo (base createBrain). */
export function migrateBrain(raw: unknown): Brain {
  const base = createBrain();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  const r = raw as Record<string, unknown>;
  const priorsRaw = r.priors;
  if (!priorsRaw || typeof priorsRaw !== "object" || Array.isArray(priorsRaw)) {
    return base;
  }
  const priors: Record<string, number> = { ...base.priors };
  for (const [k, v] of Object.entries(priorsRaw as Record<string, unknown>)) {
    if (typeof v === "number" && Number.isFinite(v)) {
      priors[k] = Math.min(PRIOR_MAX, Math.max(PRIOR_MIN, v));
    }
  }
  const hp = r.handsPlayed;
  const handsPlayed =
    typeof hp === "number" && Number.isFinite(hp) && hp >= 0
      ? Math.min(MAX_HANDS, Math.floor(hp))
      : 0;
  let lessons = base.lessons;
  if (Array.isArray(r.lessons)) {
    const filtradas = (r.lessons as unknown[]).filter(
      (l): l is Brain["lessons"][number] =>
        !!l && typeof l === "object" && typeof (l as { ts?: unknown }).ts !== "undefined",
    );
    const legado = (r.lessons as unknown[]).filter(
      (l) => !!l && typeof l === "object",
    ) as Brain["lessons"];
    lessons = (filtradas.length > 0 ? filtradas : legado).slice(-MAX_LESSONS) as Brain["lessons"];
  }
  const ep = r.epsilon;
  const epsilon =
    typeof ep === "number" && Number.isFinite(ep) ? Math.min(1, Math.max(0, ep)) : base.epsilon;
  const beliefsRaw = r.beliefs;
  const beliefs =
    Array.isArray(beliefsRaw) && beliefsRaw.every((b) => typeof b === "string")
      ? (beliefsRaw as string[]).slice(-6)
      : base.beliefs;
  const countsRaw = r.counts;
  let counts: Record<string, number> = { ...(base.counts ?? {}) };
  if (countsRaw && typeof countsRaw === "object" && !Array.isArray(countsRaw)) {
    counts = {};
    for (const [k, v] of Object.entries(countsRaw as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isFinite(v) && v >= 0) {
        counts[k] = Math.floor(v);
      }
    }
  }
  return {
    handsPlayed,
    lessons: [...lessons],
    priors,
    beliefs: beliefs.length > 0 ? [...beliefs] : [...base.beliefs],
    epsilon,
    counts,
  };
}

function clonar(b: Brain): Brain {
  return {
    handsPlayed: b.handsPlayed,
    lessons: [...(b.lessons ?? [])],
    priors: { ...(b.priors ?? {}) },
    beliefs: [...(b.beliefs ?? [])],
    epsilon: b.epsilon,
    counts: { ...(b.counts ?? {}) },
  };
}

/** Lee el cerebro del proceso (caché en memoria). Null si no hay nada guardado. */
export function loadGlobalBrain(): Brain | null {
  try {
    const actual = holder().current;
    if (!actual) return null;
    return clonar(actual);
  } catch {
    return null;
  }
}

/** Guarda el cerebro en el proceso (best-effort). Capa lessons a 100 y priors a 500. */
export function saveGlobalBrain(brain: Brain): void {
  try {
    const lessons = (brain.lessons ?? []).slice(-MAX_LESSONS);
    let entries = Object.entries(brain.priors ?? {});
    if (entries.length > MAX_PRIORS) {
      entries.sort((a, b) => Math.abs(a[1] - 0.5) - Math.abs(b[1] - 0.5));
      entries = entries.slice(entries.length - MAX_PRIORS);
    }
    const priors: Record<string, number> = {};
    for (const [k, v] of entries) priors[k] = v;
    const payload: Brain = {
      ...brain,
      lessons: [...lessons],
      priors,
      beliefs: [...(brain.beliefs ?? [])],
      counts: { ...(brain.counts ?? {}) },
    };
    holder().current = payload;
  } catch {
    // best-effort: nunca lanza
  }
}

function peso(brain: Brain, situacion: string): number {
  const c = brain.counts?.[situacion];
  if (typeof c === "number" && Number.isFinite(c) && c > 0) return c;
  const h = brain.handsPlayed;
  if (typeof h === "number" && Number.isFinite(h) && h > 0) return h;
  return 0;
}

/** Fusiona cerebro global + sala: promedia priors, suma manos, une lecciones. */
export function mergeBrains(global: Brain, room: Brain): Brain {
  const gPriors = global.priors ?? {};
  const rPriors = room.priors ?? {};
  const claves = new Set([...Object.keys(gPriors), ...Object.keys(rPriors)]);
  let priors: Record<string, number> = {};
  for (const k of claves) {
    const g = gPriors[k] ?? 0.5;
    const r = rPriors[k] ?? 0.5;
    const gDifiere = g !== 0.5;
    const rDifiere = r !== 0.5;
    if (!gDifiere && !rDifiere) {
      priors[k] = 0.5;
      continue;
    }
    if (gDifiere && !rDifiere) {
      priors[k] = g;
      continue;
    }
    if (!gDifiere && rDifiere) {
      priors[k] = r;
      continue;
    }
    const situ = k.split("/").slice(0, -1).join("/");
    const wG = peso(global, situ);
    const wR = peso(room, situ);
    const tot = wG + wR;
    const prom = tot > 0 ? (g * wG + r * wR) / tot : (g + r) / 2;
    priors[k] = Math.min(PRIOR_MAX, Math.max(PRIOR_MIN, Math.round(prom * 1000) / 1000));
  }
  if (Object.keys(priors).length > MAX_PRIORS) {
    const entries = Object.entries(priors);
    entries.sort((a, b) => Math.abs(a[1] - 0.5) - Math.abs(b[1] - 0.5));
    const recorte = entries.slice(entries.length - MAX_PRIORS);
    const capados: Record<string, number> = {};
    for (const [k, v] of recorte) capados[k] = v;
    priors = capados;
  }
  const handsPlayed = Math.min(MAX_HANDS, (global.handsPlayed ?? 0) + (room.handsPlayed ?? 0));
  const lessons = [...(global.lessons ?? []), ...(room.lessons ?? [])]
    .sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0))
    .slice(-MAX_LESSONS);
  const epsilon = Math.min(global.epsilon ?? 0.9, room.epsilon ?? 0.9);
  const beliefs = [...(global.beliefs ?? []), ...(room.beliefs ?? [])].slice(-6);
  const counts: Record<string, number> = { ...(global.counts ?? {}) };
  for (const [k, v] of Object.entries(room.counts ?? {})) {
    counts[k] = (counts[k] ?? 0) + (v ?? 0);
  }
  return {
    handsPlayed,
    lessons,
    priors,
    beliefs: beliefs.length > 0 ? beliefs : ["estoy aprendiendo"],
    epsilon,
    counts,
  };
}
