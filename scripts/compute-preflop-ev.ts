// Monte Carlo hot-cold para la tabla EV preflop entre buckets (cero deps).
// Por celda (a, b): muestrea manos reales uniformes de cada bucket con
// removal (las 4 cartas sin reemplazo; si h1 y h2 comparten carta se
// remuestrea h2), reparte board aleatorio de las 48 restantes y evalúa con
// evaluate7. EV = (ganadas + empates/2) / n; tie = empates / n.
// Uso: npx tsx scripts/compute-preflop-ev.ts [boardsPerCell] [seed]
// (por defecto 5000 y 12345). Guarda lib/games/preflop-ev.json en pretty.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BUCKETS,
  bucketOf,
  type BucketDef,
  type PreflopEvFile,
} from "../lib/games/buckets";
import { compareRanks, evaluate7 } from "../lib/poker/evaluator";
import type { Card, Rank, Suit } from "../lib/poker/types";

const PALOS: Suit[] = ["♠", "♥", "♦", "♣"];
const RANGOS: Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

type Mano = [Card, Card];

/** Generador determinista mulberry32 (reproducible por semilla). */
export function mulberry32(semilla: number): () => number {
  let s = semilla >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (s >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
}

function mazo52(): Card[] {
  const mazo: Card[] = [];
  for (const suit of PALOS) {
    for (const rank of RANGOS) mazo.push({ rank, suit });
  }
  return mazo;
}

function clave(c: Card): string {
  return `${c.rank}${c.suit}`;
}

/** Enumera los 1326 combos y los agrupa por bucket (coherente con BUCKETS). */
function combosPorBucket(): Mano[][] {
  const mazo = mazo52();
  const grupos: Mano[][] = Array.from({ length: 12 }, () => []);
  for (let i = 0; i < mazo.length; i++) {
    for (let j = i + 1; j < mazo.length; j++) {
      const a = mazo[i];
      const b = mazo[j];
      const idx = Number(bucketOf(a, b).slice(1));
      grupos[idx].push([a, b]);
    }
  }
  for (let k = 0; k < 12; k++) {
    if (grupos[k].length !== (BUCKETS[k] as BucketDef).combos) {
      throw new Error(
        `Incoherencia interna: B${k} tiene ${grupos[k].length} combos reales pero BUCKETS dice ${(BUCKETS[k] as BucketDef).combos}`,
      );
    }
  }
  return grupos;
}

function comparten(h1: Mano, h2: Mano): boolean {
  const s = new Set([clave(h1[0]), clave(h1[1])]);
  return s.has(clave(h2[0])) || s.has(clave(h2[1]));
}

/** Reparte 5 comunitarias de entre las cartas no usadas (Fisher-Yates parcial). */
function reparteBoard(base: Card[], h1: Mano, h2: Mano, azar: () => number): Card[] {
  const usadas = new Set([clave(h1[0]), clave(h1[1]), clave(h2[0]), clave(h2[1])]);
  const resto = base.filter((c) => !usadas.has(clave(c)));
  const board: Card[] = [];
  for (let k = 0; k < 5; k++) {
    const j = k + Math.floor(azar() * (resto.length - k));
    const tmp = resto[k];
    resto[k] = resto[j];
    resto[j] = tmp;
    board.push(resto[k]);
  }
  return board;
}

/**
 * Calcula la tabla EV/tie 12×12 por Monte Carlo.
 * Exportada para reutilizarla en tests con boardsPerCell pequeño.
 */
export function computePreflopEv(boardsPerCell = 5000, seed = 12345): PreflopEvFile {
  const grupos = combosPorBucket();
  const base = mazo52();
  const azar = mulberry32(seed);
  const ev: number[][] = Array.from({ length: 12 }, () => new Array<number>(12).fill(0));
  const tie: number[][] = Array.from({ length: 12 }, () => new Array<number>(12).fill(0));
  for (let a = 0; a < 12; a++) {
    const ga = grupos[a];
    for (let b = 0; b < 12; b++) {
      const gb = grupos[b];
      let gana = 0;
      let emp = 0;
      for (let n = 0; n < boardsPerCell; n++) {
        const h1 = ga[Math.floor(azar() * ga.length)];
        let h2 = gb[Math.floor(azar() * gb.length)];
        while (comparten(h1, h2)) h2 = gb[Math.floor(azar() * gb.length)];
        const board = reparteBoard(base, h1, h2, azar);
        const r1 = evaluate7([h1[0], h1[1], ...board]);
        const r2 = evaluate7([h2[0], h2[1], ...board]);
        const cmp = compareRanks(r1, r2);
        if (cmp > 0) gana++;
        else if (cmp === 0) emp++;
      }
      ev[a][b] = (gana + emp / 2) / boardsPerCell;
      tie[a][b] = emp / boardsPerCell;
    }
    const fila = (ev[a] as number[]).map((v) => v.toFixed(3)).join(" ");
    console.log(`fila ${a}/11 (${(BUCKETS[a] as BucketDef).id} ${(BUCKETS[a] as BucketDef).desc}): ${fila}`);
  }
  return { buckets: BUCKETS.map((x) => x.id), ev, tie, boardsPerCell, seed };
}

const directo = (process.argv[1] ?? "").endsWith("compute-preflop-ev.ts");
if (directo) {
  const boards = Number(process.argv[2] ?? "5000");
  const semilla = Number(process.argv[3] ?? "12345");
  if (!Number.isInteger(boards) || boards <= 0) throw new Error(`boardsPerCell inválido: ${process.argv[2]}`);
  const t0 = Date.now();
  const res = computePreflopEv(boards, semilla);
  const ruta = join(dirname(fileURLToPath(import.meta.url)), "..", "lib", "games", "preflop-ev.json");
  writeFileSync(ruta, `${JSON.stringify(res, null, 2)}\n`, "utf8");
  console.log(`guardado ${ruta} (${boards} boards/celda, seed ${semilla}, ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}
