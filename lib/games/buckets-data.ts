// Buckets preflop para CFR Hold'em HU — DATOS PUROS, sin node:fs.
// Importable desde el cliente (el loader con fs vive en buckets.ts).
// Las 169 manos iniciales se generan y clasifican PROGRAMÁTICAMENTE con las
// reglas de `clasifica()`; los combos y probabilidades se CALCULAN en código
// (pareja = 6 combos, suited = 4, offsuit = 12) y suman 1326.
//
// Reglas (primera coincidencia):
// - Pares por cuartiles: B0 AA-QQ, B1 JJ-99, B2 88-66, B3 55-22.
// - B4: AK (suited + offsuit). B5: AQs/AJs/ATs. B6: AQo/AJo.
// - B7: KQs/KJs/QJs. B8: broadway offsuit resto (ambas >= T).
// - B9: Ax suited resto. B10: suited conectadas/one-gap desde 54s
//   (misma pinta, diferencia <= 2, carta baja >= 4). B11: todo lo demás.
import type { Card } from "../poker/types";

/** Total de combos de 2 cartas en un mazo de 52 (52·51/2). */
export const TOTAL_COMBOS = 1326;

export interface BucketDef {
  /** Identificador canónico ("B0"…"B11"). */
  id: string;
  /** Descripción en español. */
  desc: string;
  /** Nº de combos de 2 cartas (suman 1326 entre los 12). */
  combos: number;
  /** Probabilidad marginal = combos / 1326. */
  prob: number;
}

/** Tabla EV/empates precomputada (formato de lib/games/preflop-ev.json). */
export interface PreflopEvFile {
  buckets: string[];
  /** EV[a][b] = P(gana A) + 0.5·P(empate) con la mano de A del bucket a. */
  ev: number[][];
  /** tie[a][b] = P(empate). */
  tie: number[][];
  boardsPerCell: number;
  seed: number;
}

const DESCS: string[] = [
  "Pares altos: AA-QQ",
  "Pares medios-altos: JJ-99",
  "Pares medios: 88-66",
  "Pares bajos: 55-22",
  "AK suited y offsuit",
  "AQ-AT suited (AQs, AJs, ATs)",
  "AQo y AJo",
  "KQs, KJs, QJs",
  "Broadway offsuit resto (ATo, KQo…)",
  "Ax suited resto",
  "Suited conectadas / one-gap desde 54s",
  "Resto",
];

/**
 * Clasifica una mano canónica (hi >= lo; hi == lo es pareja).
 * Devuelve el índice de bucket 0-11.
 */
function clasifica(hi: number, lo: number, suited: boolean): number {
  if (hi === lo) {
    if (hi >= 12) return 0; // AA, KK, QQ
    if (hi >= 9) return 1; // JJ, TT, 99
    if (hi >= 6) return 2; // 88, 77, 66
    return 3; // 55, 44, 33, 22
  }
  if (hi === 14 && lo === 13) return 4; // AKs + AKo
  if (suited && hi === 14 && lo >= 10) return 5; // AQs, AJs, ATs
  if (!suited && hi === 14 && (lo === 12 || lo === 11)) return 6; // AQo, AJo
  if (suited && ((hi === 13 && (lo === 12 || lo === 11)) || (hi === 12 && lo === 11))) {
    return 7; // KQs, KJs, QJs
  }
  if (!suited && lo >= 10) return 8; // broadway offsuit resto
  if (suited && hi === 14) return 9; // Ax suited resto (A9s-A2s)
  if (suited && hi - lo <= 2 && lo >= 4) return 10; // conectadas / one-gap 54s+
  return 11; // resto
}

/** Construye los 12 buckets enumerando las 169 manos y contando combos. */
function construyeBuckets(): BucketDef[] {
  const combos: number[] = new Array<number>(12).fill(0);
  for (let hi = 14; hi >= 2; hi--) {
    for (let lo = hi; lo >= 2; lo--) {
      if (hi === lo) {
        combos[clasifica(hi, lo, false)] += 6; // pareja: 6 combos
      } else {
        combos[clasifica(hi, lo, true)] += 4; // suited: 4 combos
        combos[clasifica(hi, lo, false)] += 12; // offsuit: 12 combos
      }
    }
  }
  return combos.map((c, i) => ({
    id: `B${i}`,
    desc: DESCS[i] as string,
    combos: c,
    prob: c / TOTAL_COMBOS,
  }));
}

export const BUCKETS: BucketDef[] = construyeBuckets();

/**
 * Bucket de dos cartas concretas. Canónico: ordena por rango y usa el flag
 * de misma pinta, así (As,Ks) y (Ks,As) dan el mismo bucket.
 * Lanza si son la misma carta exacta.
 */
export function bucketOf(c1: Card, c2: Card): string {
  if (c1.rank === c2.rank && c1.suit === c2.suit) {
    throw new Error("bucketOf: la misma carta exacta dos veces");
  }
  const hi = Math.max(c1.rank, c2.rank);
  const lo = Math.min(c1.rank, c2.rank);
  return `B${clasifica(hi, lo, c1.suit === c2.suit)}`;
}

function esMatriz12(x: unknown): x is number[][] {
  return (
    Array.isArray(x) &&
    x.length === 12 &&
    x.every(
      (f) =>
        Array.isArray(f) &&
        f.length === 12 &&
        (f as unknown[]).every((v) => typeof v === "number"),
    )
  );
}

/** Valida la forma y la coherencia (diagonal ≈ 0.5, simetría ≈ 1). */
export function validaEv(json: unknown): PreflopEvFile {
  const o = (typeof json === "object" && json !== null ? json : {}) as Record<string, unknown>;
  const okForma =
    Array.isArray(o["buckets"]) &&
    (o["buckets"] as unknown[]).length === 12 &&
    esMatriz12(o["ev"]) &&
    esMatriz12(o["tie"]) &&
    typeof o["boardsPerCell"] === "number" &&
    typeof o["seed"] === "number";
  if (!okForma) {
    throw new Error(
      "preflop-ev.json con forma inválida (se esperan buckets[12], ev[12][12], tie[12][12]). " +
        "ejecuta npm run compute-ev para regenerarla.",
    );
  }
  const ev = o["ev"] as number[][];
  const tie = o["tie"] as number[][];
  const fallos: string[] = [];
  for (let i = 0; i < 12; i++) {
    const d = ev[i]?.[i] as number;
    if (!(d >= 0 && d <= 1)) fallos.push(`EV[B${i}][B${i}]=${d} fuera de [0,1]`);
    else if (Math.abs(d - 0.5) > 0.02) fallos.push(`diagonal B${i}=${d.toFixed(4)} ≠ 0.5±0.02`);
    const t = tie[i]?.[i] as number;
    if (!(t >= 0 && t <= 1)) fallos.push(`tie[B${i}][B${i}]=${t} fuera de [0,1]`);
  }
  for (let a = 0; a < 12; a++) {
    for (let b = 0; b < 12; b++) {
      const suma = (ev[a]?.[b] as number) + (ev[b]?.[a] as number);
      if (Math.abs(suma - 1) > 0.05) {
        fallos.push(`simetría B${a}/B${b}: ${(ev[a]?.[b] as number).toFixed(4)}+${(ev[b]?.[a] as number).toFixed(4)} ≠ 1±0.05`);
      }
      if (!((ev[a]?.[b] as number) >= 0 && (ev[a]?.[b] as number) <= 1)) fallos.push(`EV[B${a}][B${b}] fuera de [0,1]`);
      if (!((tie[a]?.[b] as number) >= 0 && (tie[a]?.[b] as number) <= 1)) fallos.push(`tie[B${a}][B${b}] fuera de [0,1]`);
    }
  }
  if (fallos.length > 0) {
    throw new Error(
      `preflop-ev.json inválida (${fallos.slice(0, 4).join("; ")}). ` +
        "ejecuta npm run compute-ev para regenerarla.",
    );
  }
  return o as unknown as PreflopEvFile;
}
