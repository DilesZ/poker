// Helpers de stats para app poker: winrate, racha, VPIP y persistencia V/D en localStorage.

export type ErrorTag =
  | "VPIP_ALTO"
  | "SIN_POSICION"
  | "OVERBET"
  | "CALL_SIN_ODDS"
  | "TILT"
  | "OTRO";

export type ResultadoMano = "V" | "D" | "E"; // Victoria / Derrota / Empate

export interface RegistroManos {
  resultados: ResultadoMano[]; // ej: ["V","D","V"]
  vpipCount: number; // manos donde hiciste VPIP (pagaste/subiste preflop voluntario)
  manosTotales: number;
  errorTags: ErrorTag[];
}

const STORAGE_KEY = "poker-stats-v1";

export const registroVacio: RegistroManos = {
  resultados: [],
  vpipCount: 0,
  manosTotales: 0,
  errorTags: [],
};

/** Winrate en % (0-100). 0 si sin manos. */
export function calcWinrate(resultados: ResultadoMano[]): number {
  if (resultados.length === 0) return 0;
  const wins = resultados.filter((r) => r === "V").length;
  return Math.round((wins / resultados.length) * 1000) / 10;
}

/** Racha actual: { tipo, count }. Ej: { tipo: "V", count: 3 } = 3 wins seguidas. */
export function calcRacha(resultados: ResultadoMano[]): { tipo: ResultadoMano | null; count: number } {
  if (resultados.length === 0) return { tipo: null, count: 0 };
  const last = resultados[resultados.length - 1];
  let count = 0;
  for (let i = resultados.length - 1; i >= 0; i--) {
    if (resultados[i] === last) count++;
    else break;
  }
  return { tipo: last, count };
}

/** VPIP en % (0-100). */
export function calcVPIP(vpipCount: number, manosTotales: number): number {
  if (manosTotales <= 0) return 0;
  return Math.round((vpipCount / manosTotales) * 1000) / 10;
}

/** Añade un resultado V/D/E al registro (inmutable). */
export function registrarResultado(
  prev: RegistroManos,
  resultado: ResultadoMano,
  opts?: { hizoVpip?: boolean; errorTag?: ErrorTag }
): RegistroManos {
  return {
    resultados: [...prev.resultados, resultado],
    vpipCount: prev.vpipCount + (opts?.hizoVpip ? 1 : 0),
    manosTotales: prev.manosTotales + 1,
    errorTags: opts?.errorTag ? [...prev.errorTags, opts.errorTag] : prev.errorTags,
  };
}

/** Carga registro desde localStorage. Seguro en SSR (devuelve vacío si no hay window). */
export function loadRegistro(): RegistroManos {
  if (typeof window === "undefined") return { ...registroVacio, resultados: [] };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...registroVacio, resultados: [] };
    const parsed = JSON.parse(raw) as RegistroManos;
    if (!Array.isArray(parsed.resultados)) return { ...registroVacio, resultados: [] };
    return {
      resultados: parsed.resultados.filter((r) => r === "V" || r === "D" || r === "E"),
      vpipCount: Number(parsed.vpipCount) || 0,
      manosTotales: Number(parsed.manosTotales) || 0,
      errorTags: Array.isArray(parsed.errorTags) ? parsed.errorTags : [],
    };
  } catch {
    return { ...registroVacio, resultados: [] };
  }
}

/** Guarda registro en localStorage. No-op en SSR. */
export function saveRegistro(reg: RegistroManos): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(reg));
  } catch {
    // storage lleno o bloqueado: ignorar
  }
}

/** Limpia registro. */
export function resetRegistro(): RegistroManos {
  const limpio: RegistroManos = { resultados: [], vpipCount: 0, manosTotales: 0, errorTags: [] };
  saveRegistro(limpio);
  return limpio;
}
