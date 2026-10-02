// RNG sembrado y mezcla determinista. Sin dependencias.
import type { Card } from "@/lib/poker/types";

/** Generador mulberry32: retorna flotante en [0,1). */
export function mulberry32(seed: number): () => number {
  // Normaliza la semilla a entero sin signo de 32 bits.
  let a: number = seed >>> 0;
  return function (): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t: number = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Alias con nombre de dominio para el motor. */
export function createRng(seed: number): () => number {
  return mulberry32(seed);
}

/** Fisher-Yates con RNG inyectado. No muta el input, devuelve copia. */
export function shuffleWith<T>(arr: T[], rng: () => number): T[] {
  // Copia superficial para no mutar el original.
  const out: T[] = arr.slice();
  for (let i: number = out.length - 1; i > 0; i--) {
    const j: number = Math.floor(rng() * (i + 1));
    const tmp: T = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return out;
}

// Re-export de tipo para conveniencia (no afecta al contrato).
export type { Card };
