// Equity contra rival aleatorio y EV por acción del héroe (coach).
// Sin dependencias salvo el evaluador, los buckets preflop y los tipos.
// Todo en español. TypeScript estricto, cero dependencias externas.
import { BUCKETS, bucketOf, validaEv } from "../games/buckets-data";
import EV_JSON from "../games/preflop-ev.json";
import {
  CATEGORY_NAMES,
  compareRanks,
  evaluate5,
  evaluate7,
  type HandRank,
} from "../poker/evaluator";
import type { Card, Suit } from "../poker/types";
import type { CoachStreet, HandRecord } from "./types";

/** Equity del héroe frente a un rival aleatorio (0-1). */
export interface EquityResult {
  /** Probabilidad de ganar (cada empate vale medio punto). */
  equity: number;
  /** Nº de evaluaciones (o muestras) que la sostienen. */
  sampleSize: number;
  /** true si enumeró todo el espacio; false si es muestreo o tabla. */
  exact: boolean;
}

/** EV estimado de una acción, en ciegas grandes (BB). */
export type EvEstimate = { kind: "exact"; evBB: number } | { kind: "unavailable"; reason: string };

/** Contexto numérico de una acción del héroe (lo consume la UI del coach). */
export interface ActionContext {
  potOdds: number;
  equity: number;
  equityExact: boolean;
  equityN: number;
  madeHand: string;
  needed: number;
}

const PALOS: Suit[] = ["♠", "♥", "♦", "♣"];
const SEMILLA_FLOP = 12345;
const MUESTRAS_FLOP = 3000;

/** Mazo ordenado de 52 cartas. */
function mazoCompleto(): Card[] {
  const mazo: Card[] = [];
  for (let rank = 2; rank <= 14; rank++) {
    for (const suit of PALOS) mazo.push({ rank: rank as Card["rank"], suit });
  }
  return mazo;
}

/** Clave canónica de carta para excluir conocidas del mazo restante. */
function claveCarta(c: Card): string {
  return `${c.rank}${c.suit}`;
}

/** Mazo restante: 52 cartas menos hole+board. */
function mazoRestante(hole: Card[], board: Card[]): Card[] {
  const usadas = new Set([...hole, ...board].map(claveCarta));
  return mazoCompleto().filter((c) => !usadas.has(claveCarta(c)));
}

// Generador determinista mulberry32 (misma semilla → misma secuencia).
// Se usa SOLO para el muestreo del flop; nunca Math.random.
function mulberry32(semilla: number): () => number {
  let a = semilla >>> 0;
  return (): number => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** River (board 5): enumera los C(45,2)=990 holes rivales. Exacta. */
function equityRiver(hole: [Card, Card], board: Card[]): EquityResult {
  const resto = mazoRestante(hole, board);
  const heroe = evaluate7([...hole, ...board]);
  let ganadas = 0;
  let empatadas = 0;
  for (let i = 0; i < resto.length; i++) {
    for (let j = i + 1; j < resto.length; j++) {
      const rival = evaluate7([resto[i] as Card, resto[j] as Card, ...board]);
      const c = compareRanks(heroe, rival);
      if (c > 0) ganadas++;
      else if (c === 0) empatadas++;
    }
  }
  const total = (resto.length * (resto.length - 1)) / 2; // 990
  return { equity: (ganadas + empatadas / 2) / total, sampleSize: total, exact: true };
}

/**
 * Turn (board 4): enumeración exacta.
 * Con 6 cartas conocidas quedan 46: por cada river posible (46) se enumeran
 * los C(45,2)=990 holes rivales → 46×990 = 45540 evaluaciones.
 * (Nota: el encargo decía "990×44=43560", que parte de 45 cartas restantes;
 * lo correcto con 52−6=46 es 1035×44 = 46×990 = 45540. Se implementa lo correcto
 * y sampleSize refleja las evaluaciones realmente hechas.)
 */
function equityTurn(hole: [Card, Card], board: Card[]): EquityResult {
  const resto = mazoRestante(hole, board);
  let ganadas = 0;
  let empatadas = 0;
  let total = 0;
  for (let k = 0; k < resto.length; k++) {
    const mesa = [...board, resto[k] as Card];
    const heroe = evaluate7([...hole, ...mesa]);
    for (let i = 0; i < resto.length; i++) {
      if (i === k) continue;
      for (let j = i + 1; j < resto.length; j++) {
        if (j === k) continue;
        const rival = evaluate7([resto[i] as Card, resto[j] as Card, ...mesa]);
        const c = compareRanks(heroe, rival);
        if (c > 0) ganadas++;
        else if (c === 0) empatadas++;
        total++;
      }
    }
  }
  return { equity: (ganadas + empatadas / 2) / total, sampleSize: total, exact: true };
}

/**
 * Flop (board 3): muestreo determinista con mulberry32(12345).
 * 3000 iteraciones; cada una baraja el resto (47 cartas) y toma 2 para el
 * rival + 2 para completar el board. No exacta (sampleSize 3000).
 */
function equityFlop(hole: [Card, Card], board: Card[]): EquityResult {
  const resto = mazoRestante(hole, board);
  const rng = mulberry32(SEMILLA_FLOP);
  let puntos = 0;
  for (let s = 0; s < MUESTRAS_FLOP; s++) {
    const mazo = [...resto];
    for (let i = mazo.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = mazo[i] as Card;
      mazo[i] = mazo[j] as Card;
      mazo[j] = tmp;
    }
    const mesa = [...board, mazo[2] as Card, mazo[3] as Card];
    const c = compareRanks(
      evaluate7([...hole, ...mesa]),
      evaluate7([mazo[0] as Card, mazo[1] as Card, ...mesa]),
    );
    if (c > 0) puntos += 1;
    else if (c === 0) puntos += 0.5;
  }
  return { equity: puntos / MUESTRAS_FLOP, sampleSize: MUESTRAS_FLOP, exact: false };
}

/**
 * Preflop (board 0): equity por buckets.
 * Fila del bucket del héroe en la tabla EV, promediada con la frecuencia
 * de cada bucket rival (BUCKETS[b].prob). No exacta (tabla Monte Carlo).
 * Si el JSON empaquetado falta o es inválido (TABLA_EV null), se devuelve
 * el prior neutro 0.5, no exacto, sampleSize 0. Regenerar la
 * tabla con `npm run compute-ev`.
 */
/**
 * Tabla EV empaquetada (import JSON directo: funciona en cliente sin
 * node:fs). Si el JSON falta o es inválido, TABLA_EV queda null y el
 * preflop devuelve el prior neutro 0.5 (documentado, no inventado).
 */
let TABLA_EV: number[][] | null = null;
try {
  TABLA_EV = validaEv(EV_JSON as unknown).ev;
} catch {
  TABLA_EV = null;
}

function equityPreflop(hole: [Card, Card]): EquityResult {
  const id = bucketOf(hole[0], hole[1]); // "B0"…"B11"
  const fila = Number.parseInt(id.slice(1), 10);
  const tabla = TABLA_EV;
  if (tabla) {
    const evFila = tabla[fila];
    if (evFila) {
      let equity = 0;
      for (let b = 0; b < BUCKETS.length; b++) {
        equity += (evFila[b] ?? 0) * (BUCKETS[b]?.prob ?? 0);
      }
      return { equity, sampleSize: 0, exact: false };
    }
  }
  return { equity: 0.5, sampleSize: 0, exact: false };
}

/**
 * Equity del héroe contra un rival aleatorio según la calle por nº de board:
 * 5 → exacta (990), 4 → exacta (45540), 3 → muestreo fijo (3000),
 * 0 → tabla de buckets. Board de 1-2 cartas → Error (calle inexistente).
 */
export function equityVsRandom(hole: [Card, Card], board: Card[]): EquityResult {
  switch (board.length) {
    case 5:
      return equityRiver(hole, board);
    case 4:
      return equityTurn(hole, board);
    case 3:
      return equityFlop(hole, board);
    case 0:
      return equityPreflop(hole);
    default:
      throw new Error(
        `equityVsRandom: board debe tener 0, 3, 4 o 5 cartas (recibido ${board.length})`,
      );
  }
}

/**
 * Nombre de la mejor mano con hole+board (vía todos los C(n,5) con
 * evaluate5 y desempate con compareRanks). Con menos de 5 cartas no hay
 * showdown aún y se devuelve el literal de abajo.
 */
export function madeHandName(hole: Card[], board: Card[]): string {
  const todas = [...hole, ...board];
  if (todas.length < 5) return "preflop (sin showdown aún)";
  let mejor: HandRank | null = null;
  const n = todas.length;
  const idx = [0, 1, 2, 3, 4];
  for (;;) {
    const quinteto = idx.map((i) => todas[i] as Card);
    const r = evaluate5(quinteto);
    if (!mejor || compareRanks(r, mejor) > 0) mejor = r;
    let i = 4;
    while (i >= 0 && idx[i] === n - 5 + i) i--;
    if (i < 0) break;
    idx[i] = (idx[i] as number) + 1;
    for (let j = i + 1; j < 5; j++) idx[j] = (idx[j - 1] as number) + 1;
  }
  const cat = (mejor as HandRank).category;
  return CATEGORY_NAMES[cat] ?? `categoría ${cat}`;
}

/** Nº de cartas de board visibles en cada calle de apuesta. */
function boardNecesario(calle: CoachStreet): number {
  switch (calle) {
    case "preflop":
      return 0;
    case "flop":
      return 3;
    case "turn":
      return 4;
    case "river":
      return 5;
  }
}

// HandRecord base no trae cartas; el store las persiste como extras
// opcionales (StoredHand = HandRecord & { heroHole?; board? }). Se leen por
// intersección sin tocar lib/coach/types.ts.
type ConCartas = HandRecord & { heroHole?: Card[]; board?: Card[] };

/** Extrae heroHole (2) + board del registro, o null si no hay cartas. */
function cartasDe(rec: HandRecord): { heroHole: [Card, Card]; board: Card[] } | null {
  const r = rec as ConCartas;
  if (!Array.isArray(r.heroHole) || r.heroHole.length !== 2) return null;
  if (!Array.isArray(r.board)) return null;
  const [a, b] = r.heroHole;
  if (!a || !b) return null;
  return { heroHole: [a, b], board: r.board };
}

/** Acción válida del registro o undefined si idx es inválido. */
function accionEn(rec: HandRecord, idx: number) {
  if (!Number.isInteger(idx) || idx < 0) return undefined;
  return rec.actions[idx];
}

/**
 * EV estimado de la acción idx del héroe, en BB.
 * La equity es la de ESE momento: board recortado a su calle
 * (preflop→0, flop→3 primeras, turn→4, river→5).
 * - fold/check → 0 exacto (no ponen más fichas).
 * - call → (equity·potAfter − amount)/bb exacto.
 * - bet/raise/allin → unavailable (sin modelo de fold rival no se puede
 *   estimar cuánto ganan por foldeo; solo se conoce su coste).
 * No redondea: el redondeo a 2 decimales es de la capa que muestra.
 */
export function actionEV(rec: HandRecord, idx: number, bb: number): EvEstimate {
  const acc = accionEn(rec, idx);
  if (!acc) return { kind: "unavailable", reason: "índice de acción inválido" };
  if (acc.seat !== rec.heroSeat) return { kind: "unavailable", reason: "no es acción del héroe" };
  const cartas = cartasDe(rec);
  if (!cartas) return { kind: "unavailable", reason: "mano sin cartas registradas" };
  const need = boardNecesario(acc.street);
  if (cartas.board.length < need) return { kind: "unavailable", reason: "board incompleto" };
  switch (acc.action) {
    case "fold":
      return { kind: "exact", evBB: 0 };
    case "check":
      return { kind: "exact", evBB: 0 };
    case "call": {
      if (!(bb > 0)) return { kind: "unavailable", reason: "bb debe ser positivo" };
      const eq = equityVsRandom(cartas.heroHole, cartas.board.slice(0, need));
      return { kind: "exact", evBB: (eq.equity * acc.potAfter - acc.amount) / bb };
    }
    case "bet":
    case "raise":
    case "allin":
      return { kind: "unavailable", reason: "requiere modelo de fold rival" };
  }
}

/**
 * Contexto numérico de la acción idx (null si sin cartas o idx inválido,
 * o si el board registrado no cubre su calle).
 *
 * APROXIMACIÓN DOCUMENTADA: HandAction no guarda toCall (lo que faltaba por
 * igualar), así que potOdds se aproxima como amount/potAfter (lo pagado
 * sobre el bote final) y needed usa el mismo valor como equity mínima
 * aproximada para break-even. Es una cota útil para la UI, no pot odds reales.
 */
export function actionContext(rec: HandRecord, idx: number): ActionContext | null {
  const acc = accionEn(rec, idx);
  if (!acc) return null;
  const cartas = cartasDe(rec);
  if (!cartas) return null;
  const need = boardNecesario(acc.street);
  if (cartas.board.length < need) return null;
  const calle = cartas.board.slice(0, need);
  const eq = equityVsRandom(cartas.heroHole, calle);
  const potOdds = acc.potAfter > 0 ? acc.amount / acc.potAfter : 0;
  return {
    potOdds,
    equity: eq.equity,
    equityExact: eq.exact,
    equityN: eq.sampleSize,
    madeHand: madeHandName(cartas.heroHole, calle),
    needed: potOdds,
  };
}
