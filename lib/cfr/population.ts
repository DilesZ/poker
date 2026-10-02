// lib/cfr/population.ts — Población de oponentes para population training.
// Define el pool fijo contra el que aprende el héroe: mezcla de oponentes
// "self" (la propia estrategia actual), "uniform" (uniforme fijo) y
// "checkpoint" (estrategia media congelada de un JSON). TypeScript puro,
// cero dependencias (salvo el RNG sembrado y el loader de checkpoints).
// Sin Math.random: el muestreo usa el rng que se le pasa y `policyFor`
// no aleatoriza, solo devuelve distribuciones.
import type { RegretNode } from "./node";
import { regretMatching } from "./node";
import { loadCheckpoint, type CfrCheckpoint } from "./checkpoint";

/** Clase de oponente dentro de la población. */
export type OppKind = "self" | "uniform" | "checkpoint";

/** Miembro del pool: id único, clase, peso sin normalizar y, si es
 *  checkpoint, la ruta del JSON con la estrategia media congelada. */
export interface PopulationMember {
  id: string;
  kind: OppKind;
  weight: number;
  checkpointPath?: string;
}

/** Configuración del pool: lista de miembros con pesos sin normalizar. */
export interface PopulationConfig {
  members: PopulationMember[];
}

/**
 * Valida y normaliza la población: array no vacío, ids únicos no vacíos,
 * weight finito > 0, y los miembros checkpoint exigen checkpointPath.
 * Devuelve COPIAS con los pesos normalizados (suma 1). Lanza en español
 * si la configuración no es válida.
 */
export function normalizePopulation(cfg: PopulationConfig): PopulationMember[] {
  const lista = cfg?.members;
  if (!Array.isArray(lista) || lista.length === 0) {
    throw new Error("La población debe tener al menos un miembro (members vacío o ausente).");
  }
  const vistos = new Set<string>();
  let suma = 0;
  for (const m of lista) {
    if (typeof m?.id !== "string" || (m.id as string).length === 0) {
      throw new Error("Cada miembro de la población debe tener un id no vacío.");
    }
    if (vistos.has(m.id)) {
      throw new Error(`Id duplicado en la población: "${m.id}".`);
    }
    vistos.add(m.id);
    if (m.kind !== "self" && m.kind !== "uniform" && m.kind !== "checkpoint") {
      throw new Error(`Miembro "${m.id}": kind inválido (${String(m.kind)}); usa "self", "uniform" o "checkpoint".`);
    }
    if (typeof m.weight !== "number" || !Number.isFinite(m.weight) || m.weight <= 0) {
      throw new Error(
        `Miembro "${m.id}": weight debe ser un número finito > 0 (recibido: ${String(m.weight)}).`,
      );
    }
    if (m.kind === "checkpoint" && (typeof m.checkpointPath !== "string" || m.checkpointPath.length === 0)) {
      throw new Error(`Miembro checkpoint "${m.id}": exige checkpointPath no vacío.`);
    }
    suma += m.weight;
  }
  if (!(suma > 0) || !Number.isFinite(suma)) {
    throw new Error(`La suma de pesos debe ser finita y > 0 (recibido: ${String(suma)}).`);
  }
  return lista.map((m) => ({ ...m, weight: m.weight / suma }));
}

/**
 * Muestrea un miembro por ruleta según sus pesos. Supone pesos ya
 * normalizados (suma ≈ 1). Usa SOLO el rng inyectado (nada de Math.random).
 * Lanza si la lista está vacía.
 */
export function sampleMember(members: PopulationMember[], rng: () => number): PopulationMember {
  if (!Array.isArray(members) || members.length === 0) {
    throw new Error("No se puede muestrear de una población vacía.");
  }
  const r = rng();
  let acumulado = 0;
  for (const m of members) {
    acumulado += m.weight;
    if (r < acumulado) return m;
  }
  // Seguridad ante redondeo (p. ej. r muy cercano a 1): último miembro.
  return members[members.length - 1] as PopulationMember;
}

/** Política del oponente: distribución sobre las acciones legales (sin aleatorizar). */
export type OppPolicy = (key: string, legal: string[]) => number[];

/** Distribución uniforme sobre n acciones. */
function uniforme(n: number): number[] {
  return Array.from({ length: n }, () => 1 / n);
}

/**
 * Mapea una distribución indexada por `acciones` a las `legal` POR NOMBRE
 * (robusto al orden). Pesos negativos/no finitos → 0; si nada tiene peso,
 * uniforme sobre legal.
 */
function mapearPorNombre(acciones: string[], probs: number[], legal: string[]): number[] {
  const mapa = new Map<string, number>();
  for (let i = 0; i < acciones.length; i++) {
    mapa.set(acciones[i] as string, probs[i] as number);
  }
  const pesos = legal.map((a) => {
    const w = mapa.get(a) ?? 0;
    return typeof w === "number" && Number.isFinite(w) ? Math.max(0, w) : 0;
  });
  const suma = pesos.reduce((acc, x) => acc + x, 0);
  if (!(suma > 0)) return uniforme(legal.length);
  return pesos.map((w) => w / suma);
}

/**
 * Construye la política fija del miembro sobre los nodos actuales:
 * - self: regretMatching del nodo (uniforme si el infoset aún no existe).
 * - uniform: uniforme sobre legal (lanza si legal está vacío).
 * - checkpoint: estrategia media congelada del JSON (strategySum normalizada;
 *   uniforme si la suma es 0), mapeada POR NOMBRE de acción (robusta al orden)
 *   y uniforme si el infoset falta en el checkpoint. El fichero se carga UNA
 *   vez y se cachea en el closure; si no existe o es inválido, lanza claro.
 * Nunca aleatoriza: devuelve distribuciones.
 */
export function policyFor(member: PopulationMember, nodes: Map<string, RegretNode>): OppPolicy {
  const id = member.id;
  switch (member.kind) {
    case "uniform":
      return (_key: string, legal: string[]): number[] => {
        if (!Array.isArray(legal) || legal.length === 0) {
          throw new Error(`Miembro "${id}": legal vacío, no hay política uniforme que devolver.`);
        }
        return uniforme(legal.length);
      };
    case "self":
      return (key: string, legal: string[]): number[] => {
        if (!Array.isArray(legal) || legal.length === 0) {
          throw new Error(`Miembro "${id}": legal vacío, no hay política que devolver.`);
        }
        const nodo = nodes.get(key);
        if (nodo === undefined) return uniforme(legal.length);
        return mapearPorNombre(nodo.actions, regretMatching(nodo), legal);
      };
    case "checkpoint": {
      if (typeof member.checkpointPath !== "string" || member.checkpointPath.length === 0) {
        throw new Error(`Miembro checkpoint "${id}": exige checkpointPath no vacío.`);
      }
      const ruta = member.checkpointPath;
      let cargado: CfrCheckpoint | null = null;
      const cargar = (): CfrCheckpoint => {
        if (cargado === null) {
          try {
            cargado = loadCheckpoint(ruta);
          } catch (e) {
            const detalle = e instanceof Error ? e.message : String(e);
            throw new Error(`Miembro "${id}": no se pudo cargar su checkpoint "${ruta}" (${detalle}).`);
          }
        }
        return cargado;
      };
      return (key: string, legal: string[]): number[] => {
        if (!Array.isArray(legal) || legal.length === 0) {
          throw new Error(`Miembro "${id}": legal vacío, no hay política que devolver.`);
        }
        const cp = cargar();
        const entrada = cp.nodes[key];
        if (entrada === undefined) return uniforme(legal.length);
        // avg = strategySum normalizada (uniforme si suma 0), por nombre.
        return mapearPorNombre(entrada.actions, entrada.s, legal);
      };
    }
    default:
      throw new Error(`Miembro "${id}": kind inválido (${String(member.kind)}).`);
  }
}

/**
 * Valida que train y eval no compartan ids (el solape filtra estrategia y
 * contamina la evaluación). Los ids "self"/"uniform" también cuentan: si un
 * oponente debe estar en ambas, duplícalo con otro id. Lanza en español con
 * el id solapado.
 */
export function validateDisjoint(train: PopulationConfig, eval_: PopulationConfig): void {
  const enTrain = new Set<string>((train?.members ?? []).map((m) => m.id));
  for (const m of eval_?.members ?? []) {
    if (enTrain.has(m.id)) {
      throw new Error(
        `Solape train/eval: el id "${m.id}" está en ambas poblaciones. ` +
          `Si lo quieres en ambas, duplícalo con otro id.`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Re-exports de integración P6.
// La implementación del entrenamiento vive en ./trainer (dueña del traverser
// exacto); aquí se re-exporta para que el CLI (scripts/train.ts, que programa
// contra este módulo) use un único punto de entrada. Sin riesgo de ciclo:
// ambos módulos solo se usan entre sí dentro de cuerpos de función.
// ---------------------------------------------------------------------------
export { trainVsPopulation } from "./trainer";
export type { PopTrainOptions, PopTrainResult } from "./trainer";
