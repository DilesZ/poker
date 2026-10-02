// Estrategia versionada para training v0.2. Sin React, sin DOM en import.
// Persiste en localStorage (key poker-strategy) con fallback en memoria.

/** Posiciones 6-max. Mapeo asiento→posición: 0=BTN,1=SB,2=BB,3=EP,4=MP,5=CO (relativo al botón). */
export type TablePosition = "BTN" | "SB" | "BB" | "EP" | "MP" | "CO";

export const TABLE_POSITIONS: readonly TablePosition[] = [
  "BTN",
  "SB",
  "BB",
  "EP",
  "MP",
  "CO",
] as const;

/** Pesos de sizing para apuestas (fracción del bote). Suman ~1. */
export interface SizingWeights {
  "33": number;
  "50": number;
  "75": number;
}

/** Estrategia versionada. rangeWeights: 169 clases (13 parejas + 78 suited + 78 offsuit). */
export interface StrategyVersion {
  version: number;
  pushFoldThresholds: Record<TablePosition, number>;
  rangeWeights: number[];
  sizingWeights: SizingWeights;
  /** Compat panel entrenar: 0-1 (0 loose … 1 tight). */
  tightness: number;
  /** Compat panel entrenar: 0-1 (0 pasivo … 1 agresivo). */
  aggression: number;
  /** Momentum de thresholds por posición (v2, opcional para compat). */
  thresholdMomentum?: Record<TablePosition, number>;
  /** Momentum de sizing por fracción (v2, opcional para compat). */
  sizingMomentum?: Record<"33" | "50" | "75", number>;
}

export const STRATEGY_STORAGE_KEY = "poker-strategy";
export const STRATEGY_VERSION = 1;
export const RANGE_SIZE = 169;

/** Learning rate base v2 (6 updates/mano). Big-pot = base + 0.04. */
export const LR_BASE = 0.08;
export const LR_BIGPOT = 0.12;

function clip01(x: number): number {
  if (!Number.isFinite(x)) return 0.5;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function defaultThresholds(): Record<TablePosition, number> {
  return {
    BTN: 0.5,
    SB: 0.55,
    BB: 0.52,
    EP: 0.6,
    MP: 0.57,
    CO: 0.53,
  };
}

function defaultThresholdMomentum(): Record<TablePosition, number> {
  return { BTN: 0, SB: 0, BB: 0, EP: 0, MP: 0, CO: 0 };
}

function defaultSizingMomentum(): Record<"33" | "50" | "75", number> {
  return { "33": 0, "50": 0, "75": 0 };
}

/** Estrategia por defecto v1. No mutar directamente: usar cloneStrategy(). */
export const DEFAULT_STRATEGY: StrategyVersion = {
  version: STRATEGY_VERSION,
  pushFoldThresholds: defaultThresholds(),
  rangeWeights: Array.from({ length: RANGE_SIZE }, () => 0.5),
  sizingWeights: { "33": 0.3, "50": 0.5, "75": 0.2 },
  tightness: 0.5,
  aggression: 0.5,
  thresholdMomentum: defaultThresholdMomentum(),
  sizingMomentum: defaultSizingMomentum(),
};

/** Clona profundo (para no mutar DEFAULT ni el input de selfplay). */
export function cloneStrategy(s: StrategyVersion): StrategyVersion {
  return {
    version: s.version,
    pushFoldThresholds: { ...s.pushFoldThresholds },
    rangeWeights: [...s.rangeWeights],
    sizingWeights: { ...s.sizingWeights },
    tightness: s.tightness,
    aggression: s.aggression,
    thresholdMomentum: { ...(s.thresholdMomentum ?? defaultThresholdMomentum()) },
    sizingMomentum: { ...(s.sizingMomentum ?? defaultSizingMomentum()) },
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function toFiniteNumber(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/**
 * Migra cualquier payload (versiones viejas, parciales, corruptas) a StrategyVersion vigente.
 * - version desconocida/futura → se fija a STRATEGY_VERSION conservando pesos válidos.
 * - thresholds fuera de [0,1] → clip; ausentes → default.
 * - rangeWeights con longitud ≠169 → se rellena/recorta con 0.5.
 * - sizingWeights inválidos → default, normalizados a suma 1.
 * - tightness/aggression ausentes → 0.5 (compat panel entrenar).
 */
export function migrate(raw: unknown): StrategyVersion {
  const fallback = cloneStrategy(DEFAULT_STRATEGY);
  if (!isRecord(raw)) return fallback;
  const out: StrategyVersion = cloneStrategy(fallback);

  const rawVersion = toFiniteNumber(raw["version"], STRATEGY_VERSION);
  out.version = STRATEGY_VERSION;
  // Se acepta cualquier versión numérica como migrable a la vigente.
  void rawVersion;

  out.tightness = clip01(toFiniteNumber(raw["tightness"], fallback.tightness));
  out.aggression = clip01(toFiniteNumber(raw["aggression"], fallback.aggression));

  if (isRecord(raw["pushFoldThresholds"])) {
    const t = raw["pushFoldThresholds"] as Record<string, unknown>;
    for (const pos of TABLE_POSITIONS) {
      const v = t[pos];
      if (typeof v === "number" && Number.isFinite(v)) {
        out.pushFoldThresholds[pos] = clip01(v);
      }
    }
  }

  if (Array.isArray(raw["rangeWeights"])) {
    const arr = raw["rangeWeights"] as unknown[];
    const weights: number[] = [];
    for (let i = 0; i < RANGE_SIZE; i++) {
      const v = arr[i];
      weights.push(typeof v === "number" && Number.isFinite(v) ? clip01(v) : 0.5);
    }
    out.rangeWeights = weights;
  }

  if (isRecord(raw["sizingWeights"])) {
    const sw = raw["sizingWeights"] as Record<string, unknown>;
    const a = toFiniteNumber(sw["33"], fallback.sizingWeights["33"]);
    const b = toFiniteNumber(sw["50"], fallback.sizingWeights["50"]);
    const c = toFiniteNumber(sw["75"], fallback.sizingWeights["75"]);
    const sum = a + b + c;
    if (sum > 0 && Number.isFinite(sum)) {
      out.sizingWeights = {
        "33": clip01(a / sum),
        "50": clip01(b / sum),
        "75": clip01(c / sum),
      };
      // Renormaliza para que sumen 1 tras el clip (caso borde).
      const s2 = out.sizingWeights["33"] + out.sizingWeights["50"] + out.sizingWeights["75"];
      if (s2 > 0) {
        out.sizingWeights["33"] /= s2;
        out.sizingWeights["50"] /= s2;
        out.sizingWeights["75"] /= s2;
      }
    }
  }

  // Momentum v2: opcional, preserva si válido, default 0 (compat con payloads viejos).
  if (isRecord(raw["thresholdMomentum"])) {
    const tm = raw["thresholdMomentum"] as Record<string, unknown>;
    const base = defaultThresholdMomentum();
    for (const pos of TABLE_POSITIONS) {
      const v = tm[pos];
      base[pos] = typeof v === "number" && Number.isFinite(v) ? v : 0;
    }
    out.thresholdMomentum = base;
  } else {
    out.thresholdMomentum = defaultThresholdMomentum();
  }

  if (isRecord(raw["sizingMomentum"])) {
    const sm = raw["sizingMomentum"] as Record<string, unknown>;
    const base = defaultSizingMomentum();
    for (const k of ["33", "50", "75"] as const) {
      const v = sm[k];
      base[k] = typeof v === "number" && Number.isFinite(v) ? v : 0;
    }
    out.sizingMomentum = base;
  } else {
    out.sizingMomentum = defaultSizingMomentum();
  }

  return out;
}

// Cache en memoria (SSR / Node sin localStorage).
let memoryCache: StrategyVersion | null = null;

function readStorage(): StrategyVersion | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(STRATEGY_STORAGE_KEY);
    if (!raw) return null;
    return migrate(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

/** Carga estrategia: memoria → localStorage → default. Nunca lanza. */
export function loadStrategy(): StrategyVersion {
  if (memoryCache) return cloneStrategy(memoryCache);
  const fromStorage = readStorage();
  if (fromStorage) {
    memoryCache = cloneStrategy(fromStorage);
    return cloneStrategy(fromStorage);
  }
  return cloneStrategy(DEFAULT_STRATEGY);
}

/** Guarda estrategia en memoria + localStorage (best-effort). Nunca lanza. */
export function saveStrategy(s: StrategyVersion): void {
  const clean = migrate(s);
  memoryCache = cloneStrategy(clean);
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STRATEGY_STORAGE_KEY, JSON.stringify(clean));
    }
  } catch {
    // Cuota/privacidad: se conserva solo en memoria.
  }
}

/** Solo tests: limpia cache en memoria. */
export function _clearStrategyMemoryCache(): void {
  memoryCache = null;
}
