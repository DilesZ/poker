// Reflexión del agente: construye el registro de la mano y gira la ruleta de
// claves de situación. La clave es el puente entre lo que decide el cerebro
// (claveDesdeContexto) y lo que aprende tras la mano (claveSituacion): ambas
// deben devolver lo mismo para que el aprendizaje se transfiera.
//
// V2 (CEREBRO rico): la clave nueva es `calle/precio/stack/rivales` donde
// precio=free|cheap|pricey, stack=short|mid|deep, rivales=HU|multi.
// Por compat, cuando no hay dato de rivales se devuelve la clave vieja
// `calle/cubo` (toCall0/hasPot), así los registros viejos siguen aprendiendo.
import type { BrainAction, BrainContext, HandRecord } from "./brain";
import { bucketFuerza, estimateCardStrength } from "./strength";

/** Cubo de situación: "toCall0" (decisión sin precio) o "hasPot" (hay precio). */
export type Cubo = "toCall0" | "hasPot";

/** Precio V2: free (toCall==0) | cheap (price<0.3) | pricey. */
export type Precio = "free" | "cheap" | "pricey";
/** Stack V2: short(<200) | mid(<600) | deep. */
export type StackBucket = "short" | "mid" | "deep";
/** Rivales V2: HU(<=1) | multi. */
export type RivalBucket = "HU" | "multi";

const CUBOS: readonly Cubo[] = ["toCall0", "hasPot"];
const CALLES = ["preflop", "flop", "turn", "river"] as const;
const RIVALES = ["HU", "multi"] as const;
const PRECIOS: readonly Precio[] = ["free", "cheap", "pricey"];
const STACKS: readonly StackBucket[] = ["short", "mid", "deep"];
const FUERZAS = ["weak", "mid", "strong"] as const;

/** Ruleta: 8 claves base (compat) + 16 con rivales (HU/multi) + 72 ricas V2
 * + 216 ricas V3 (72 con sufijo /fuerza weak|mid|strong).
 * Total distintas 312 (8+16+72+216). Se mantienen todas las anteriores por
 * compat; el cerebro NO pre-genera las 216 V3 (bajo demanda con fallback 0.5).
 * Debe seguir conteniendo "preflop/toCall0" y "flop/hasPot". */
export const RULETA_SITUACIONES: readonly string[] = [
  ...CALLES.flatMap((calle) => CUBOS.map((cubo) => `${calle}/${cubo}`)),
  ...CALLES.flatMap((calle) =>
    CUBOS.flatMap((cubo) => RIVALES.map((r) => `${calle}/${cubo}/${r}`)),
  ),
  ...CALLES.flatMap((calle) =>
    PRECIOS.flatMap((precio) =>
      STACKS.flatMap((stack) => RIVALES.map((r) => `${calle}/${precio}/${stack}/${r}`)),
    ),
  ),
  ...CALLES.flatMap((calle) =>
    PRECIOS.flatMap((precio) =>
      STACKS.flatMap((stack) =>
        RIVALES.flatMap((r) => FUERZAS.map((f) => `${calle}/${precio}/${stack}/${r}/${f}`)),
      ),
    ),
  ),
];

const TIPOS: readonly BrainAction["type"][] = ["fold", "check", "call", "raise", "allin"];

/** Acción en crudo para armar un HandRecord. */
export interface AccionMano {
  street: string;
  type: BrainAction["type"];
  amount?: number;
  /** Fichas que había que igualar en ese momento (marca el cubo "hasPot"). */
  toCall?: number;
}

export interface HandRecordInput {
  won: boolean;
  myCards: string;
  board?: string;
  /** Por defecto: calle de la última acción. */
  street?: string;
  actions?: AccionMano[];
  showdown?: boolean;
  potWon?: number;
  stackDelta?: number;
  /** Rivales en la mano (para clave HU/multi). */
  numRivales?: number;
}

/** Normaliza una mano cruda a HandRecord con acciones legibles ("call 60"). */
export function buildHandRecord(datos: HandRecordInput): HandRecord {
  const acciones = (datos.actions ?? []).map((a) => ({
    street: a.street,
    action: formatearAccion(a),
  }));
  const street = datos.street ?? acciones[acciones.length - 1]?.street ?? "preflop";
  return {
    won: datos.won,
    myCards: datos.myCards,
    board: datos.board ?? "",
    street,
    actionHistory: acciones,
    showdown: datos.showdown ?? false,
    potWon: datos.potWon ?? 0,
    stackDelta: datos.stackDelta ?? 0,
    ...(typeof datos.numRivales === "number" ? { numRivales: datos.numRivales } : {}),
  };
}

/** Bucket de precio V2: free si toCall==0, cheap si price<0.3, pricey si no. */
export function bucketPrecio(toCall: number, pot: number): Precio {
  if (toCall <= 0) return "free";
  const price = toCall / (pot + toCall);
  return price < 0.3 ? "cheap" : "pricey";
}

/** Bucket de stack V2: short(<200) | mid(<600) | deep. */
export function bucketStack(stack: number): StackBucket {
  if (stack < 200) return "short";
  if (stack < 600) return "mid";
  return "deep";
}

/** Stack global del record: mid si no hay dato, si no bucket de delta+pot. */
export function stackDeRecord(record: HandRecord): StackBucket {
  if (record.potWon === 0 && record.stackDelta === 0) return "mid";
  return bucketStack(record.stackDelta + record.potWon);
}

/** Precio de una acción histórica (para crédito total y claveSituacion rica).
 * call/fold → cheap/pricey según potWon/importe (pricey si no hay dato);
 * check → free; raise/allin con "(precio" → cheap/pricey (pricey si no hay
 * pot para calcular), sin precio → free (apertura). */
export function precioDeAccionHistorica(
  actionText: string,
  record: HandRecord,
): Precio {
  const parseo = parsearAccion(actionText);
  if (!parseo) return "free";
  if (parseo.tipo === "check") return "free";
  if (parseo.tipo === "call" || parseo.tipo === "fold") {
    if (record.potWon === 0 && record.stackDelta === 0) return "pricey";
    const importe = parseo.importe;
    if (importe > 0 && record.potWon > 0) return bucketPrecio(importe, record.potWon);
    if (record.stackDelta !== 0 && record.potWon > 0)
      return bucketPrecio(Math.abs(record.stackDelta), record.potWon);
    // "toCall grande → pricey si no cheap": sin pot, umbral 50.
    if (importe > 0) return importe > 50 ? "pricey" : "cheap";
    return "pricey";
  }
  // raise / allin
  if (actionText.includes("(precio")) {
    const m = actionText.match(/\(precio\s+(\d+)/);
    const precioVal = m ? Number.parseInt(m[1] ?? "", 10) : NaN;
    if (Number.isFinite(precioVal) && (precioVal as number) > 0) {
      if (record.potWon > 0) return bucketPrecio(precioVal as number, record.potWon);
      return "pricey";
    }
    return "pricey";
  }
  return "free";
}

/** Board parcial para fuerza progresiva: preflop "" (solo hole), flop 3,
 * turn 4, river 5+ (board completo). Tokens separados por espacios. */
export function boardParcial(board: string, calleAccion: string): string {
  if (!board || typeof board !== "string") return "";
  const calle = normalizarCalle(calleAccion);
  if (calle === "preflop") return "";
  const tokens = board.trim().split(/\s+/).filter(Boolean);
  if (calle === "flop") return tokens.slice(0, 3).join(" ");
  if (calle === "turn") return tokens.slice(0, 4).join(" ");
  return tokens.join(" ");
}

/** Bucket de fuerza global del record (try/catch → "mid"). */
function fuerzaDeRecord(record: HandRecord): string {
  try {
    return bucketFuerza(estimateCardStrength(record.myCards, record.board));
  } catch {
    return "mid";
  }
}

/** Bucket de fuerza progresiva: hole + board parcial según la calle. */
function fuerzaProgresiva(record: HandRecord, calleAccion: string): string {
  try {
    const parcial = boardParcial(record.board ?? "", calleAccion);
    return bucketFuerza(estimateCardStrength(record.myCards, parcial));
  } catch {
    return "mid";
  }
}

/** Clave rica por acción (para crédito total): calle/precio/stack/rivales/fuerza (V3).
 * Si no hay numRivales, devuelve clave vieja calle/cubo por compat. */
export function claveParaAccion(
  streetAccion: string,
  actionText: string,
  record: HandRecord,
): string {
  const calle = normalizarCalle(streetAccion);
  if (typeof record.numRivales !== "number") {
    return `${calle}/${cuboDeTexto(actionText)}`;
  }
  const precio = precioDeAccionHistorica(actionText, record);
  const stack = stackDeRecord(record);
  const rival = record.numRivales <= 1 ? "HU" : "multi";
  const fuerza = fuerzaProgresiva(record, calle);
  return `${calle}/${precio}/${stack}/${rival}/${fuerza}`;
}

/** Clave de situación desde el registro: última decisión + su cubo de precio.
 * Sin numRivales → vieja `calle/cubo` (compat exacta). Con rivales → rica V3
 * `calle/precio/stack/rivales/fuerza` (fuerza global del record). */
export function claveSituacion(record: HandRecord): string {
  const historial = record.actionHistory.filter(
    (a) => a.street !== "showdown" && a.street !== "done",
  );
  const ultima = historial[historial.length - 1];
  const calle = normalizarCalle(ultima?.street ?? record.street);
  if (typeof record.numRivales !== "number") {
    if (!ultima) return `${calle}/toCall0`;
    const enCalle = historial.filter((a) => a.street === ultima.street);
    return `${calle}/${cuboDe(enCalle)}`;
  }
  const rival = record.numRivales <= 1 ? "HU" : "multi";
  const stack = stackDeRecord(record);
  if (!ultima) return `${calle}/free/${stack}/${rival}/${fuerzaDeRecord(record)}`;
  const precio = precioDeAccionHistorica(ultima.action, record);
  return `${calle}/${precio}/${stack}/${rival}/${fuerzaDeRecord(record)}`;
}

/** Clave de situación en caliente: mismo cubo, derivado del precio enfrentado.
 * Sin numRivales → vieja `calle/cubo` (compat exacta). Con rivales → rica V3
 * `calle/precio/stack/rivales/fuerza` con fuerza de ctx.strength (?? 0.5). */
export function claveDesdeContexto(ctx: BrainContext): string {
  const calle = normalizarCalle(ctx.street);
  if (typeof ctx.numRivales !== "number") {
    const cubo: Cubo = ctx.toCall > 0 ? "hasPot" : "toCall0";
    return `${calle}/${cubo}`;
  }
  const precio = bucketPrecio(ctx.toCall, ctx.pot);
  const stack = bucketStack(ctx.myStack);
  const rival = ctx.numRivales <= 1 ? "HU" : "multi";
  const fuerza = bucketFuerza(ctx.strength ?? 0.5);
  return `${calle}/${precio}/${stack}/${rival}/${fuerza}`;
}

/** Parsea una acción registrada ("raise 120 (precio 40)") a tipo e importe. */
export function parsearAccion(
  texto: string,
): { tipo: BrainAction["type"]; importe: number } | null {
  const partes = texto.trim().toLowerCase().split(/\s+/);
  const tipo = TIPOS.find((t) => t === partes[0]);
  if (!tipo) return null;
  const importe = Number.parseInt(partes[1] ?? "", 10);
  return { tipo, importe: Number.isFinite(importe) ? importe : 0 };
}

/** Cubo de la última decisión del héroe en la calle. */
function cuboDe(acciones: { action: string }[]): Cubo {
  const ultima = acciones[acciones.length - 1];
  if (!ultima) return "toCall0";
  if (ultima.action.includes("(precio")) return "hasPot";
  const parseo = parsearAccion(ultima.action);
  if (!parseo) return "toCall0";
  if (parseo.tipo === "call" || parseo.tipo === "fold") return "hasPot";
  if (parseo.tipo === "check") return "toCall0";
  // raise/allin sin precio declarado: apertura si es la primera acción de la calle.
  return acciones.length > 1 ? "hasPot" : "toCall0";
}

/** Cubo de un texto de acción aislado (para crédito viejo sin rivales). */
function cuboDeTexto(actionText: string): Cubo {
  if (actionText.includes("(precio")) return "hasPot";
  const parseo = parsearAccion(actionText);
  if (!parseo) return "toCall0";
  if (parseo.tipo === "call" || parseo.tipo === "fold") return "hasPot";
  if (parseo.tipo === "check") return "toCall0";
  return "toCall0";
}

function normalizarCalle(calle: string | undefined): string {
  if (!calle) return "preflop";
  if (calle === "showdown" || calle === "done") return "river";
  return calle;
}

function formatearAccion(a: AccionMano): string {
  const importe = typeof a.amount === "number" && a.amount > 0 ? ` ${a.amount}` : "";
  // call/fold ya implican precio; para raise/allin se declara explícito.
  const precio =
    (a.type === "raise" || a.type === "allin") && (a.toCall ?? 0) > 0
      ? ` (precio ${a.toCall})`
      : "";
  return `${a.type}${importe}${precio}`;
}
