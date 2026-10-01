// Reflexión del agente: construye el registro de la mano y gira la ruleta de
// claves de situación. La clave es el puente entre lo que decide el cerebro
// (claveDesdeContexto) y lo que aprende tras la mano (claveSituacion): ambas
// deben devolver lo mismo para que el aprendizaje se transfiera.
import type { BrainAction, BrainContext, HandRecord } from "./brain";

/** Cubo de situación: "toCall0" (decisión sin precio) o "hasPot" (hay precio). */
export type Cubo = "toCall0" | "hasPot";

const CUBOS: readonly Cubo[] = ["toCall0", "hasPot"];
const CALLES = ["preflop", "flop", "turn", "river"] as const;

/** Ruleta: las 8 claves de situación posibles del cerebro. */
export const RULETA_SITUACIONES: readonly string[] = CALLES.flatMap((calle) =>
  CUBOS.map((cubo) => `${calle}/${cubo}`),
);

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
  };
}

/** Clave de situación desde el registro: última decisión + su cubo de precio. */
export function claveSituacion(record: HandRecord): string {
  const historial = record.actionHistory.filter(
    (a) => a.street !== "showdown" && a.street !== "done",
  );
  const ultima = historial[historial.length - 1];
  const calle = normalizarCalle(ultima?.street ?? record.street);
  if (!ultima) return `${calle}/toCall0`;
  const enCalle = historial.filter((a) => a.street === ultima.street);
  return `${calle}/${cuboDe(enCalle)}`;
}

/** Clave de situación en caliente: mismo cubo, derivado del precio enfrentado. */
export function claveDesdeContexto(ctx: BrainContext): string {
  const calle = normalizarCalle(ctx.street);
  const cubo: Cubo = ctx.toCall > 0 ? "hasPot" : "toCall0";
  return `${calle}/${cubo}`;
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
