// Cerebro autónomo del agente: tabula rasa, aprende solo mano a mano.
// NO importa ni usa lib/training/** (legado) ni getAiAction de lib/poker/ai.ts.
// Toda la estrategia nace de dos sitios: priors por clave de situación y la reflexión
// posterior a cada mano. Cero reglas fijas tipo "par > raise": ni handRankApprox
// (ctx) ni las cartas deciden la acción, solo el aprendizaje acumulado.
//
// V2: estado rico 72 situaciones (calle/precio/stack/rivales), crédito total
// a TODA la actionHistory con descuento 0.8^d y magnitud por bote, regret
// contrafactual para tipos no usados, epsilon efectivo por visitas + bonus UCB.
import { potOdds } from "../poker/game";
import type { Street } from "../poker/types";
import {
  claveDesdeContexto,
  claveParaAccion,
  claveSituacion,
  parsearAccion,
} from "./reflection";

export interface Lesson {
  id: string;
  situation: string;
  outcome: "victoria" | "derrota";
  insight: string;
  change: string;
  handsPlayed: number;
  ts: number;
  /** Magnitud del crédito V2 (0.5-1.5 según bote). */
  magnitude?: number;
  /** Nº de acciones acreditadas en la mano (crédito total). */
  actionsCredited?: number;
}

export interface Brain {
  handsPlayed: number;
  lessons: Lesson[];
  /** Prior por clave `${situacion}/${accion}` (ej. "flop/hasPot/call") → 0.05-0.95. */
  priors: Record<string, number>;
  beliefs: string[];
  epsilon: number;
  /** Contador por clave de situación (ej. "flop/hasPot/HU" → manos vistas). */
  counts?: Record<string, number>;
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
  /** Rivales en la mano (para distinguir HU vs multi). */
  numRivales?: number;
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
  /** Rivales en la mano (HU vs multi); ausente en registros viejos. */
  numRivales?: number;
}

const STEP_WIN = 0.08;
const STEP_LOSS = -0.06;
const DESCUENTO = 0.8;
const CONTRA_PESO = 0.15;
const PRIOR_MIN = 0.05;
const PRIOR_MAX = 0.95;
const EPSILON_MIN = 0.1;
const EPSILON_DECAY = 0.98;
const UMBRALES_EPSILON = [0.5, 0.3, 0.2, 0.1];
const CALLES = ["preflop", "flop", "turn", "river"] as const;
const CUBOS = ["toCall0", "hasPot"] as const;
const PRECIOS = ["free", "cheap", "pricey"] as const;
const STACKS = ["short", "mid", "deep"] as const;
const TIPOS = ["fold", "check", "call", "raise", "allin"] as const;
const RIVALES = ["HU", "multi"] as const;
const MAX_LESSONS = 100;

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
        // Clave vieja (compat): sin sufijo de rivales.
        priors[`${calle}/${cubo}/${tipo}`] = 0.5;
        for (const rival of RIVALES) {
          priors[`${calle}/${cubo}/${rival}/${tipo}`] = 0.5;
        }
      }
    }
    // Claves ricas V2: calle/precio/stack/rivales (4*3*3*2=72 situaciones).
    for (const precio of PRECIOS) {
      for (const stack of STACKS) {
        for (const rival of RIVALES) {
          for (const tipo of TIPOS) {
            priors[`${calle}/${precio}/${stack}/${rival}/${tipo}`] = 0.5;
          }
        }
      }
    }
  }
  return {
    handsPlayed: 0,
    lessons: [],
    priors,
    beliefs: ["estoy aprendiendo"],
    epsilon: 0.9,
    counts: {},
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
  const visits = brain.counts?.[clave] ?? 0;
  // Exploración efectiva: decae con visitas, suelo 5%.
  const effEps = Math.max(0.05, Math.min(brain.epsilon, 1 / Math.sqrt(1 + visits)));

  // Exploración: azar puro entre candidatos legales (el raise abre 0.5*pot).
  if (Math.random() < effEps) return conTamano(elegirAzar(candidatos), legal);

  // Explotación: mejor prior + bonus UCB para desempatar a favor de lo menos visto.
  const bonus = 0.01 / (1 + visits);
  let mejor = candidatos[0] as BrainAction;
  let mejorPuntaje = Number.NEGATIVE_INFINITY;
  for (const accion of candidatos) {
    const puntaje = priorEvaluado(brain, clave, accion, legal) + bonus;
    // Desempate aleatorio: sin datos, ninguna acción merece ventaja previa.
    if (puntaje > mejorPuntaje || (puntaje === mejorPuntaje && Math.random() < 0.5)) {
      mejor = accion;
      mejorPuntaje = puntaje;
    }
  }
  return conTamano(mejor, legal);
}

/** Aprende de la mano: crédito total a TODA la actionHistory + decae epsilon. */
export function reflectOnHand(
  brain: Brain,
  record: HandRecord,
): { brain: Brain; lesson?: Lesson } {
  const epsilonAntes = brain.epsilon;
  const claveUltima = claveSituacion(record);
  const historial = record.actionHistory.filter(
    (a) => a.street !== "showdown" && a.street !== "done",
  );

  const priors = { ...brain.priors };
  // Magnitud V2: botes grandes enseñan más.
  const magnitude =
    0.5 + Math.min(1, Math.abs(record.stackDelta) / Math.max(50, record.potWon + 20));
  const base = record.won ? STEP_WIN : STEP_LOSS;

  let anteriorUltima = 0.5;
  let nuevoUltimo = 0.5;
  let cambioUltimo = 0;
  let tipoUltimo: BrainAction["type"] | null = null;
  let importeUltimo = 0;

  const n = historial.length;
  for (let i = 0; i < n; i++) {
    const item = historial[i] as { street: string; action: string };
    const d = n - 1 - i;
    const discount = Math.pow(DESCUENTO, d);
    const step = base * discount * magnitude;
    // Clave de esta acción histórica (para la última, usa la clave oficial).
    const esUltima = i === n - 1;
    const claveAccion = esUltima ? claveUltima : claveParaAccion(item.street, item.action, record);
    const parseo = parsearAccion(item.action);
    if (!parseo) continue;
    const priorKey = `${claveAccion}/${parseo.tipo}`;
    const anterior = priorConFallback(priors, claveAccion, parseo.tipo);
    const nuevo = limitar(redondear(anterior + step), PRIOR_MIN, PRIOR_MAX);
    priors[priorKey] = nuevo;
    if (esUltima) {
      anteriorUltima = anterior;
      nuevoUltimo = nuevo;
      cambioUltimo = Math.abs(nuevo - anterior);
      tipoUltimo = parseo.tipo;
      importeUltimo = parseo.importe;
    }
  }

  // Contrapartida contrafactual: en la situación de la última acción,
  // los tipos NO usados se mueven en -step*0.15 (si ganó la usada, bajan).
  if (tipoUltimo && n > 0) {
    const stepUltimo = base * 1 * magnitude; // d=0 → discount 1
    const contra = -stepUltimo * CONTRA_PESO;
    for (const tipo of TIPOS) {
      if (tipo === tipoUltimo) continue;
      const anterior = priorConFallback(priors, claveUltima, tipo as BrainAction["type"]);
      const nuevo = limitar(redondear(anterior + contra), PRIOR_MIN, PRIOR_MAX);
      priors[`${claveUltima}/${tipo}`] = nuevo;
    }
  }

  let epsilon = Math.max(EPSILON_MIN, redondear(epsilonAntes * EPSILON_DECAY, 6));
  const handsPlayed = brain.handsPlayed + 1;
  const lessonsAcum = [...brain.lessons];

  const primeraMano = brain.handsPlayed === 0;
  const cruzoUmbral = UMBRALES_EPSILON.some((t) => epsilonAntes > t && epsilon <= t);
  let lesson: Lesson | undefined;
  if (tipoUltimo && (primeraMano || cambioUltimo > 0.02 || cruzoUmbral)) {
    lesson = crearLesson({
      clave: claveUltima,
      tipo: tipoUltimo,
      importe: importeUltimo,
      record,
      anterior: anteriorUltima,
      nuevo: nuevoUltimo,
      handsPlayed,
      magnitude,
      actionsCredited: n,
    });
    lessonsAcum.push(lesson);
  }
  // Capa lecciones a las últimas 100.
  const lessons = lessonsAcum.slice(-MAX_LESSONS);

  // Contador por situación (clave de la última acción).
  const counts: Record<string, number> = { ...(brain.counts ?? {}) };
  counts[claveUltima] = (counts[claveUltima] ?? 0) + 1;

  // Re-anneal simple: si lleva muchas manos y gana poco, re-explora.
  if (handsPlayed > 110 && lessons.length > 0) {
    const victorias = lessons.filter((l) => l.outcome === "victoria").length;
    const winrate = victorias / lessons.length;
    if (winrate < 0.4) epsilon = Math.max(0.15, epsilon);
  }

  const beliefs =
    handsPlayed % 10 === 0
      ? [...brain.beliefs.slice(-5), resumenDeBalance(lessons)]
      : brain.beliefs;

  return {
    brain: { handsPlayed, lessons, priors, beliefs, epsilon, counts },
    lesson,
  };
}

/** Prior con fallback V2: directa → quita stack (precio→cubo + rivales) → vieja → 0.5. */
export function priorConFallback(
  priors: Record<string, number>,
  clave: string,
  tipo: BrainAction["type"],
): number {
  const directa = priors[`${clave}/${tipo}`];
  if (directa !== undefined) return directa;
  const partes = clave.split("/");
  if (partes.length === 4) {
    // Rica: calle/precio/stack/rivales → calle/cubo/rivales.
    const [calle, precio, , rival] = partes as [string, string, string, string];
    const cubo = precio === "free" ? "toCall0" : "hasPot";
    // cheap/pricey → hasPot; free → toCall0. También cubre precio ya viejo.
    const cuboReal =
      precio === "toCall0" || precio === "hasPot" ? precio : cubo;
    const conRivales = priors[`${calle}/${cuboReal}/${rival}/${tipo}`];
    if (conRivales !== undefined) return conRivales;
    const vieja = priors[`${calle}/${cuboReal}/${tipo}`];
    if (vieja !== undefined) return vieja;
    return 0.5;
  }
  if (partes.length === 3) {
    const [calle, segundo, tercero] = partes as [string, string, string];
    const esCubo = segundo === "toCall0" || segundo === "hasPot";
    const esPrecio = segundo === "free" || segundo === "cheap" || segundo === "pricey";
    const esRival = tercero === "HU" || tercero === "multi";
    const esStack = tercero === "short" || tercero === "mid" || tercero === "deep";
    if (esCubo && esRival) {
      const vieja = priors[`${calle}/${segundo}/${tipo}`];
      if (vieja !== undefined) return vieja;
      return 0.5;
    }
    if (esPrecio && (esRival || esStack)) {
      const cubo = segundo === "free" ? "toCall0" : "hasPot";
      if (esRival) {
        const conRiv = priors[`${calle}/${cubo}/${tercero}/${tipo}`];
        if (conRiv !== undefined) return conRiv;
      }
      const vieja = priors[`${calle}/${cubo}/${tipo}`];
      if (vieja !== undefined) return vieja;
      return 0.5;
    }
    if (esCubo) {
      const vieja = priors[`${calle}/${segundo}/${tipo}`];
      if (vieja !== undefined) return vieja;
      return 0.5;
    }
    return 0.5;
  }
  return 0.5;
}

/** Prior de la acción en la clave, 0.5 si aún no se ha visto. */
function priorEvaluado(
  brain: Brain,
  clave: string,
  accion: BrainAction,
  legal: BrainLegal,
): number {
  const prior = priorConFallback(brain.priors, clave, accion.type);
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
  magnitude?: number;
  actionsCredited?: number;
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
    ...(typeof datos.magnitude === "number" ? { magnitude: datos.magnitude } : {}),
    ...(typeof datos.actionsCredited === "number"
      ? { actionsCredited: datos.actionsCredited }
      : {}),
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


