// lib/cfr/agent.ts — Agente jugable CFR preflop + fallback postflop. Español.
// Lee un checkpoint entrenado (loadCheckpoint) y juega la estrategia MEDIA
// (strategySum normalizada) en preflop; fuera de preflop o ante un miss
// delega en un baseline de respaldo. Sin Math.random: todo azar vía rng().
// Cero dependencias salvo los contratos indicados.
//
// Contrato de abstracción (lo escribe otro agente en paralelo):
//   - lib/games/buckets.ts: `bucketOf(c1, c2): string` (bucket de las 2 hole).
//   - lib/games/holdem-hu.ts: `abstractHistory(tokens: string[]): string`
//     (abstrae info.bettingHistory; lanza si hay tokens con "/" —son
//     marcadores de calle que preflop no debería traer—).
// Clave de lookup: `HU:<bucket>:<P0|P1>:<SB|BB>:<hist>`.
//
// CORRESPONDENCIA DE ASIENTOS (documentada aquí porque es la pieza delicada):
// el checkpoint se entrenó con asientos abstractos P0/P1, no con asientos
// reales de mesa. Por convención del entrenamiento, P0 = primer actor
// preflop = SB (en HU la SB es el botón y abre la acción preflop). En
// runtime: si el héroe es SB (heroSeat === buttonSeat) → "P0"; si es BB →
// "P1". El campo <SB|BB> de la key repite la posición real por legibilidad
// del contrato (en HU coincide con P0/P1, pero se conserva porque así lo
// define lib/games/holdem-hu.ts).
import type { BaselineAgent, BaselineId } from "@/lib/baselines/agent";
import { BASELINES } from "@/lib/baselines/agent";
import type { EngineAction } from "@/lib/engine/types";
import type { InformationSet } from "@/lib/engine/infoset";
import { bucketOf } from "@/lib/games/buckets";
import { abstractHistory } from "@/lib/games/holdem-hu";
import { loadCheckpoint, type CfrCheckpoint } from "./checkpoint";

/** Agente CFR preflop: BaselineAgent + contadores de respaldo. */
export interface CfrPreflopAgent extends BaselineAgent {
  misses(): number;
  fallbacksPostflop(): number;
}

/** Entrada de estrategia media por clave. */
export interface EstrategiaMedia {
  actions: string[];
  probs: number[];
}

/**
 * Estrategia media desde un checkpoint: normaliza el campo `s`
 * (strategySum) de cada nodo. Si la suma es 0 (nodo nunca visitado),
 * uniforme. NUNCA usa `r` (regretSum). Devuelve un Map nuevo (no aliasa).
 */
export function averageFromCheckpoint(cp: CfrCheckpoint): Map<string, EstrategiaMedia> {
  const mapa = new Map<string, EstrategiaMedia>();
  for (const [clave, nodo] of Object.entries(cp.nodes)) {
    const acciones: string[] = [...nodo.actions];
    const n = acciones.length;
    if (n === 0) continue;
    const pesos: number[] = nodo.s.map((v) => (typeof v === "number" && Number.isFinite(v) ? v : 0));
    const total = pesos.reduce((acc, v) => acc + v, 0);
    const probs: number[] =
      total <= 0 ? acciones.map(() => 1 / n) : pesos.map((v) => v / (total as number));
    mapa.set(clave, { actions: acciones, probs });
  }
  return mapa;
}

/** Muestrea un índice según probs con rng() (sin Math.random). */
function muestrearIndice(probs: number[], rng: () => number): number {
  const u: number = rng();
  let acumulado = 0;
  for (let i = 0; i < probs.length; i++) {
    acumulado += probs[i] ?? 0;
    if (u < acumulado) return i;
  }
  return probs.length - 1;
}

/**
 * Traduce una acción abstracta del checkpoint a EngineAction legal.
 * Tolera palabras ("fold", "check", "call", "bet", "raise", "allin",
 * "pass") y tokens de historial del motor ("f", "x", "c", "b", "r", "a"
 * con o sin importe, p. ej. "c20", "b50", "r60"). Los tamaños usan el
 * mínimo legal (betMin / raiseToMin): determinista y siempre legal.
 * Devuelve undefined si la acción no se reconoce o no es legal ahora
 * (el llamador delega entonces en el fallback).
 */
function aAccionMotor(nombre: string, info: InformationSet): EngineAction | undefined {
  const t = nombre.trim().toLowerCase();
  const legal = info.legal;
  if (t === "fold" || t === "f") {
    return legal.canFold ? { type: "fold" } : undefined;
  }
  if (t === "check" || t === "x") {
    return legal.canCheck ? { type: "check" } : undefined;
  }
  if (t === "call" || t === "c" || /^c\d+(\.\d+)?$/.test(t) || t.startsWith("call")) {
    return legal.canCall ? { type: "call" } : undefined;
  }
  if (t === "bet" || t === "b" || /^b\d+(\.\d+)?$/.test(t) || t.startsWith("bet")) {
    return legal.canBet ? { type: "bet", amount: legal.betMin } : undefined;
  }
  if (t === "raise" || t === "r" || /^r\d+(\.\d+)?$/.test(t) || t.startsWith("raise")) {
    return legal.canRaise ? { type: "raise", to: legal.raiseToMin } : undefined;
  }
  if (
    t === "allin" ||
    t === "all-in" ||
    t === "a" ||
    /^a\d+(\.\d+)?$/.test(t) ||
    t.startsWith("all")
  ) {
    return legal.canAllIn ? { type: "allin" } : undefined;
  }
  // "pass" (juegos pequeños Kuhn/Leduc): sin deuda equivale a check,
  // con deuda equivale a fold.
  if (t === "pass" || t === "p") {
    if (legal.canCheck) return { type: "check" };
    return legal.canFold ? { type: "fold" } : undefined;
  }
  return undefined;
}

/**
 * Crea el agente desde un checkpoint YA cargado (sin tocar disco).
 * Se exporta para que los tests construyan checkpoints sintéticos en
 * memoria sin necesidad de archivos.
 */
export function createCfrPreflopAgent(
  cp: CfrCheckpoint,
  fallbackId: BaselineId = "tag",
): CfrPreflopAgent {
  const respaldo: BaselineAgent | undefined = BASELINES[fallbackId];
  if (!respaldo) {
    const disp = Object.keys(BASELINES).join(", ");
    throw new Error(`Fallback desconocido: "${fallbackId}". Disponibles: ${disp}.`);
  }
  const media = averageFromCheckpoint(cp);
  let misses = 0;
  let postflop = 0;

  const decidir = (info: InformationSet, rng: () => number): EngineAction => {
    // Postflop (y resto de calles): no hay CFR entrenado → respaldo.
    if (info.street !== "preflop") {
      postflop++;
      return respaldo.decide(info, rng);
    }
    // Bucket preflop de las 2 hole (si lanza → respaldo + miss).
    let bucket: string;
    try {
      bucket = bucketOf(info.hole[0], info.hole[1]);
    } catch {
      misses++;
      return respaldo.decide(info, rng);
    }
    // Posición real y asiento abstracto (ver CORRESPONDENCIA arriba):
    // en HU la SB es el botón; SB → P0, BB → P1.
    const esSB = info.heroSeat === info.buttonSeat;
    const pos = esSB ? "SB" : "BB";
    const jugador = esSB ? "P0" : "P1";
    // Historial abstraído (si lanza por tokens con "/" → respaldo + miss).
    let hist: string;
    try {
      hist = abstractHistory(info.bettingHistory);
    } catch {
      misses++;
      return respaldo.decide(info, rng);
    }
    const clave = `HU:${bucket}:${jugador}:${pos}:${hist}`;
    const entrada = media.get(clave);
    if (!entrada || entrada.actions.length === 0) {
      misses++;
      return respaldo.decide(info, rng);
    }
    const indice = muestrearIndice(entrada.probs, rng);
    const nombreAccion = entrada.actions[indice] as string;
    const accion = aAccionMotor(nombreAccion, info);
    if (!accion) {
      // Acción muestreada irreconocible o ilegal ahora: respaldo + miss.
      misses++;
      return respaldo.decide(info, rng);
    }
    return accion;
  };

  return {
    // "cfr-preflop" no pertenece al union BaselineId (reservado a los 7
    // baselines); se entrega igual en runtime porque playMatch solo exige
    // la forma { id, name, version, decide } y nunca valida el id.
    id: "cfr-preflop" as unknown as BaselineId,
    name: `CFR preflop + ${fallbackId} post`,
    version: cp.version,
    decide: decidir,
    misses: () => misses,
    fallbacksPostflop: () => postflop,
  };
}

/**
 * Carga el checkpoint desde disco y crea el agente jugable.
 * version del agente = version del checkpoint.
 */
export function loadCfrPreflopAgent(
  checkpointPath: string,
  fallbackId: BaselineId = "tag",
): CfrPreflopAgent {
  const cp: CfrCheckpoint = loadCheckpoint(checkpointPath);
  return createCfrPreflopAgent(cp, fallbackId);
}
