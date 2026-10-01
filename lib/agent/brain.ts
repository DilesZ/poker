// Cerebro autónomo del agente: tabula rasa, aprende solo mano a mano.
// NO importa ni usa lib/training/** (legado) ni getAiAction de lib/poker/ai.ts.
// Toda la estrategia nace de dos sitios: priors por clave de situación y la reflexión
// posterior a cada mano. Cero reglas fijas tipo "par > raise": ni handRankApprox
// (ctx) ni las cartas deciden la acción, solo el aprendizaje acumulado.
import { potOdds } from "../poker/game";
import type { Street } from "../poker/types";
import { claveDesdeContexto, claveSituacion, parsearAccion } from "./reflection";

export interface Lesson {
  id: string;
  situation: string;
  outcome: "victoria" | "derrota";
  insight: string;
  change: string;
  handsPlayed: number;
  ts: number;
}

export interface Brain {
  handsPlayed: number;
  lessons: Lesson[];
  /** Prior por clave `${situacion}/${accion}` (ej. "flop/hasPot/call") → 0.05-0.95. */
  priors: Record<string, number>;
  beliefs: string[];
  epsilon: number;
}

export type BrainAction = { type: "fold" | "check" | "call" | "raise" | "allin"; size?: number };

export interface BrainLegal {
  candidates: BrainAction[];
  toCall: number;
  pot: number;
  stack: number;
}

export interface BrainContext {
  street: Street;
  boardLen: number;
  myStack: number;
  pot: number;
  toCall: number;
  /** Reservado: no influye en la decisión (sería estrategia predefinida). */
  handRankApprox?: number;
}

export interface HandRecord {
  won: boolean;
  myCards: string;
  board: string;
  street: string;
  actionHistory: { street: string; action: string }[];
  showdown: boolean;
  potWon: number;
  stackDelta: number;
}

const SUBIDA = 0.05;
const BAJADA = 0.04;
const PRIOR_MIN = 0.05;
const PRIOR_MAX = 0.95;
const EPSILON_MIN = 0.1;
const EPSILON_DECAY = 0.98;
const UMBRALES_EPSILON = [0.5, 0.3, 0.2, 0.1];
const CALLES = ["preflop", "flop", "turn", "river"] as const;
const CUBOS = ["toCall0", "hasPot"] as const;
const TIPOS = ["fold", "check", "call", "raise", "allin"] as const;

const VERBOS: Record<BrainAction["type"], string> = {
  fold: "retirarme",
  check: "pasar",
  call: "llamar",
  raise: "subir",
  allin: "ir all-in",
};

/** Cerebro en blanco: priors uniformes 0.5, sin lecciones, epsilon alto (explora). */
export function createBrain(): Brain {
  const priors: Record<string, number> = {};
  for (const calle of CALLES) {
    for (const cubo of CUBOS) {
      for (const tipo of TIPOS) {
        priors[`${calle}/${cubo}/${tipo}`] = 0.5;
      }
    }
  }
  return {
    handsPlayed: 0,
    lessons: [],
    priors,
    beliefs: ["estoy aprendiendo"],
    epsilon: 0.9,
  };
}

/** Elige acción: epsilon-greedy sobre priors aprendidos de la clave de situación. */
export function chooseBrainAction(brain: Brain, legal: BrainLegal, ctx: BrainContext): BrainAction {
  const candidatos = legal.candidates;
  if (candidatos.length === 0) {
    // Defensa ante un motor que no ofrezca candidatos (no debería ocurrir).
    return { type: legal.toCall > 0 ? "fold" : "check" };
  }
  if (candidatos.length === 1) return conTamano(candidatos[0] as BrainAction, legal);

  const clave = claveDesdeContexto(ctx);

  // Exploración: azar puro entre candidatos legales (el raise abre 0.5*pot).
  if (Math.random() < brain.epsilon) return conTamano(elegirAzar(candidatos), legal);

  // Explotación: mejor prior; con precio, el call compara su prior con las pot odds.
  let mejor = candidatos[0] as BrainAction;
  let mejorPuntaje = Number.NEGATIVE_INFINITY;
  for (const accion of candidatos) {
    const puntaje = priorEvaluado(brain, clave, accion, legal);
    // Desempate aleatorio: sin datos, ninguna acción merece ventaja previa.
    if (puntaje > mejorPuntaje || (puntaje === mejorPuntaje && Math.random() < 0.5)) {
      mejor = accion;
      mejorPuntaje = puntaje;
    }
  }
  return conTamano(mejor, legal);
}

/** Aprende de la mano: mueve el prior de la acción usada y decae epsilon. */
export function reflectOnHand(
  brain: Brain,
  record: HandRecord,
): { brain: Brain; lesson?: Lesson } {
  const epsilonAntes = brain.epsilon;
  const clave = claveSituacion(record);
  const ultima = record.actionHistory[record.actionHistory.length - 1];
  const parseo = ultima ? parsearAccion(ultima.action) : null;

  const priors = { ...brain.priors };
  let anterior = 0.5;
  let nuevo = 0.5;
  let cambio = 0;
  if (parseo) {
    const priorKey = `${clave}/${parseo.tipo}`;
    anterior = priors[priorKey] ?? 0.5;
    nuevo = limitar(
      redondear(anterior + (record.won ? SUBIDA : -BAJADA)),
      PRIOR_MIN,
      PRIOR_MAX,
    );
    cambio = Math.abs(nuevo - anterior);
    priors[priorKey] = nuevo;
  }

  const epsilon = Math.max(EPSILON_MIN, redondear(epsilonAntes * EPSILON_DECAY, 6));
  const handsPlayed = brain.handsPlayed + 1;
  const lessons = [...brain.lessons];

  const primeraMano = brain.handsPlayed === 0;
  const cruzoUmbral = UMBRALES_EPSILON.some((t) => epsilonAntes > t && epsilon <= t);
  let lesson: Lesson | undefined;
  if (parseo && (primeraMano || cambio > 0.02 || cruzoUmbral)) {
    lesson = crearLesson({
      clave,
      tipo: parseo.tipo,
      importe: parseo.importe,
      record,
      anterior,
      nuevo,
      handsPlayed,
    });
    lessons.push(lesson);
  }

  const beliefs =
    handsPlayed % 10 === 0
      ? [...brain.beliefs.slice(-5), resumenDeBalance(lessons)]
      : brain.beliefs;

  return {
    brain: { handsPlayed, lessons, priors, beliefs, epsilon },
    lesson,
  };
}

/** Prior de la acción en la clave, 0.5 si aún no se ha visto. */
function priorEvaluado(
  brain: Brain,
  clave: string,
  accion: BrainAction,
  legal: BrainLegal,
): number {
  const prior = brain.priors[`${clave}/${accion.type}`] ?? 0.5;
  if (accion.type === "call" && legal.toCall > 0) {
    const precio = potOdds(legal.toCall, legal.pot);
    // Si el prior aprendido no cubre el precio, el call deja de competir.
    return prior <= precio ? prior - 1 : prior;
  }
  return prior;
}

function conTamano(accion: BrainAction, legal: BrainLegal): BrainAction {
  if (accion.type !== "raise") return accion;
  return { type: "raise", size: accion.size ?? tamanoRaise(legal) };
}

/** Tamaño de apertura de raise: 0.5*pot, limitado por el stack. */
function tamanoRaise(legal: BrainLegal): number {
  const bruto = Math.max(1, Math.round(legal.pot * 0.5));
  return legal.stack > 0 ? Math.min(bruto, legal.stack) : 0;
}

function elegirAzar(candidatos: BrainAction[]): BrainAction {
  const i = Math.floor(Math.random() * candidatos.length);
  return (candidatos[i] ?? candidatos[0]) as BrainAction;
}

interface LessonDatos {
  clave: string;
  tipo: BrainAction["type"];
  importe: number;
  record: HandRecord;
  anterior: number;
  nuevo: number;
  handsPlayed: number;
}

function crearLesson(datos: LessonDatos): Lesson {
  const { clave, tipo, importe, record, anterior, nuevo, handsPlayed } = datos;
  const calle = clave.split("/")[0] ?? "preflop";
  const ts = Date.now();
  const base = importe > 0 ? `${tipo} ${importe} en ${calle}` : `${tipo} en ${calle}`;
  const situation = `${base} ${contextoSituacion(record, tipo)}`;
  const change =
    nuevo === anterior
      ? `mantuve en ${nuevo.toFixed(2)} la prior de ${VERBOS[tipo]} en ${calle}`
      : `${nuevo > anterior ? "subí" : "bajé"} a ${nuevo.toFixed(2)} la prior de ${
          VERBOS[tipo]
        } en ${calle}`;
  return {
    id: `L${String(handsPlayed).padStart(4, "0")}-${ts}`,
    situation,
    outcome: record.won ? "victoria" : "derrota",
    insight: insightDe(record, tipo),
    change,
    handsPlayed,
    ts,
  };
}

function contextoSituacion(record: HandRecord, tipo: BrainAction["type"]): string {
  if (record.showdown) return "y fuimos a showdown";
  if (record.won) return "sin enseñar cartas";
  if (tipo === "call") return "sin mostrarme fuerza";
  if (tipo === "fold") return "dejé la mano";
  return "y lo resolví en la calle";
}

function insightDe(record: HandRecord, tipo: BrainAction["type"]): string {
  if (record.won) {
    if (tipo === "call") return "gané el bote mostrando resistencia";
    if (tipo === "raise" || tipo === "allin") return "gané el bote presionando con mi apuesta";
    if (tipo === "check") return "gané el bote gratis en la calle";
    return "gané el bote y mi decisión acertó";
  }
  if (tipo === "call") return "pagué el precio y no me salió el bote";
  if (tipo === "fold") return "cedí el bote con fichas ya comprometidas";
  if (tipo === "raise" || tipo === "allin") return "mi apuesta no bastó y perdí el bote";
  return "pasé y me costó el bote";
}

/** Cada 10 manos: resumen de balance a partir de las lecciones acumuladas. */
function resumenDeBalance(lessons: Lesson[]): string {
  const victorias = lessons.filter((l) => l.outcome === "victoria").length;
  const derrotas = lessons.length - victorias;
  return `voy ${victorias}W-${derrotas}D, ${lecturaDeFlop(lessons)}`;
}

function lecturaDeFlop(lessons: Lesson[]): string {
  const llamadas = lessons.filter(
    (l) => l.situation.includes("call") && l.situation.includes("en flop"),
  );
  if (llamadas.length === 0) return "sigo buscando mi juego";
  const victorias = llamadas.filter((l) => l.outcome === "victoria").length;
  return victorias * 2 >= llamadas.length
    ? "mi llamada en flop funciona"
    : "mi llamada en flop me cuesta fichas";
}

function limitar(x: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, x));
}

function redondear(x: number, decimales = 3): number {
  const f = 10 ** decimales;
  return Math.round(x * f) / f;
}
