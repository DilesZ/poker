// Cerebro autónomo del agente: tabula rasa, aprende solo mano a mano.
// NO importa ni usa lib/training/** (legado) ni getAiAction de lib/poker/ai.ts.
//
// V2: estado rico 72 situaciones (calle/precio/stack/rivales), crédito total
// a TODA la actionHistory con descuento 0.8^d y magnitud por bote, regret
// contrafactual para tipos no usados, epsilon efectivo por visitas + bonus UCB.
//
// V3 CARD-AWARE: la clave suma bucket de fuerza
// `calle/precio/stack/rivales/fuerza` (216 situaciones nuevas, bajo demanda);
// la decisión suma un shape por cartas (raise/allin premian fuerza, fold
// premia debilidad) + ajuste por mesa loose/tight. La fuerza NUNCA impone
// reglas fijas: solo desplaza la puntuación y abre buckets para aprender.
import { potOdds } from "../poker/game";
import type { Street } from "../poker/types";
import {
  claveDesdeContexto,
  claveParaAccion,
  claveSituacion,
  parsearAccion,
} from "./reflection";
import { bucketFuerza, estimateCardStrength } from "./strength";

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
  /** Bucket de fuerza V3 de la mano (weak|mid|strong). Solo informativo. */
  strengthBucket?: string;
  /** Delta de fichas de la mano (para la métrica EV bb/100). */
  stackDelta?: number;
  /** Si la mano llegó a showdown (métrica showdown%). */
  showdown?: boolean;
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
  /** Baseline por situación: delta medio esperado (EMA). La mayoría de manos
   * pierde las ciegas; solo aprende lo mejor/peor que ese coste (ventaja). */
  baselines?: Record<string, number>;
}

export type BrainAction = { type: "fold" | "check" | "call" | "raise" | "allin"; size?: number };

export interface BrainLegal {
  candidates: BrainAction[];
  toCall: number;
  pot: number;
  stack: number;
  /** Ciega grande para el veto preflop (toCall>1bb con basura→fold). Opcional, default 20. */
  bb?: number;
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
  /** Fuerza de cartas 0-1 (la pasa roomEngine como {..., strength, rivalLoose}).
   * Opcional: ausente → 0.5 (shape 0, no cambia la matemática vieja). */
  strength?: number;
  /** 0=tight … 1=loose (mesa). Opcional: ajusta call/raise/fold ±0.02-0.04. */
  rivalLoose?: number;
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

const STEP_VENTAJA = 0.055;
const ESCALA_VENTAJA = 100;
const BASE_INICIAL = -5;
const ALFA_BASE = 0.15;
/** Fold perdiendo como mucho las dos ciegas (10+20): fold correcto, premia. */
const GOOD_FOLD_MAX_PERDIDA = -30;
const GOOD_FOLD_VENTAJA = 0.15;
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
    baselines: {},
  };
}

/** Elige acción: epsilon-greedy sobre priors + shape por cartas (V3).
 * Shape: fold premia debilidad (0.5-strength)*0.35 (preflop (0.45-strength)*0.6,
 * más duro con basura); call/check (strength-0.5)*0.25;
 * raise/allin (strength-0.5)*0.45. Sin strength (0.5) el shape es 0: matemática
 * vieja intacta. Disciplina preflop: con strength<0.42 y toCall>1bb (bb de
 * legal.bb, default 20; si toCall<=0 no hay veto) se vetan call/raise/allin
 * (solo fold). Anti-bingo: el allin se filtra salvo mano fuerte (>0.55) o
 * short-stack (≤10bb); en exploración sale con prob 0.1. Ajuste rival: mesa loose (rivalLoose>0.45) call +0.03 y raise
 * con strong +0.04 (la loose paga de más: se extrae valor); mesa nit
 * (rivalLoose<0.2) fold con mid -0.02 (ante nits que casi nunca farolean, el
 * fold marginal pierde atractivo: se respeta menos su agresión). Mantiene el
 * veto pot-odds para call y el UCB/epsilon efectivo. */
export function chooseBrainAction(brain: Brain, legal: BrainLegal, ctx: BrainContext): BrainAction {
  let candidatos = legal.candidates;
  if (candidatos.length === 0) {
    // Defensa ante un motor que no ofrezca candidatos (no debería ocurrir).
    return { type: legal.toCall > 0 ? "fold" : "check" };
  }
  if (candidatos.length === 1) return conTamano(candidatos[0] as BrainAction, legal);

  // Disciplina preflop: basura (<0.42) ante precio (>1bb) → solo fold.
  // No veta el check gratis (toCall<=0): BTN gratis ve flop.
  const strengthVeto = ctx.strength ?? 0.5;
  const bb = legal.bb ?? 20;
  if (ctx.street === "preflop" && legal.toCall > 0 && strengthVeto < 0.42 && legal.toCall > 1 * bb) {
    const filtrados = candidatos.filter((a) => a.type === "fold");
    if (filtrados.length === 0) return { type: "fold" };
    if (filtrados.length === 1) return conTamano(filtrados[0] as BrainAction, legal);
    candidatos = filtrados;
  }

  // Guardarraíl anti-bingo: el all-in exige mano fuerte o short-stack.
  // Sin esto, la exploración uniforme (allin = 1 de 4-5 candidatos) shovea
  // ~20% de las decisiones aleatorias y la liga degenera en lotería all-in
  // (showdown 100%, EV muy negativo): los priors aprenden ruido, no poker.
  // El short-stack push/fold (<10bb) sigue permitido: es juego correcto.
  const shortStack = legal.stack > 0 && legal.stack <= 10 * bb;
  if (!shortStack && strengthVeto <= 0.55) {
    const sinAllin = candidatos.filter((a) => a.type !== "allin");
    if (sinAllin.length > 0) candidatos = sinAllin;
  }
  if (candidatos.length === 1) return conTamano(candidatos[0] as BrainAction, legal);

  const clave = claveDesdeContexto(ctx);
  const visits = brain.counts?.[clave] ?? 0;
  // Exploración efectiva: decae con visitas, suelo 5%.
  const effEps = Math.max(0.05, Math.min(brain.epsilon, 1 / Math.sqrt(1 + visits)));

  // Exploración ponderada: el all-in (si sobrevivió al guardarraíl) sale con
  // prob 0.1; el resto se reparte el 0.9. Azar puro sobre-shoveaba.
  if (Math.random() < effEps) return conTamano(elegirAzarPonderado(candidatos), legal);

  // Explotación: mejor prior + shape por cartas + ajuste rival + bonus UCB.
  const bonus = 0.01 / (1 + visits);
  const strength = ctx.strength ?? 0.5;
  const bucket = bucketFuerza(strength);
  const rl = ctx.rivalLoose;
  const esPreflop = ctx.street === "preflop";
  let mejor = candidatos[0] as BrainAction;
  let mejorPuntaje = Number.NEGATIVE_INFINITY;
  for (const accion of candidatos) {
    const base = priorEvaluado(brain, clave, accion, legal);
    let shape: number;
    if (accion.type === "fold") shape = esPreflop ? (0.45 - strength) * 0.6 : (0.5 - strength) * 0.35;
    else if (accion.type === "call" || accion.type === "check")
      shape = (strength - 0.5) * 0.25;
    else shape = (strength - 0.5) * 0.45;
    let rivalAdj = 0;
    if (typeof rl === "number" && Number.isFinite(rl)) {
      if (rl > 0.45) {
        if (accion.type === "call") rivalAdj += 0.03;
        // Solo raise (no allin): el allin ya lleva shape grande; no sobre-shovear.
        if (accion.type === "raise" && bucket === "strong") rivalAdj += 0.04;
      } else if (rl < 0.2) {
        if (accion.type === "fold" && bucket === "mid") rivalAdj -= 0.02;
      }
    }
    const puntaje = base + shape + rivalAdj + bonus;
    // Desempate aleatorio: sin datos, ninguna acción merece ventaja previa.
    if (puntaje > mejorPuntaje || (puntaje === mejorPuntaje && Math.random() < 0.5)) {
      mejor = accion;
      mejorPuntaje = puntaje;
    }
  }
  return conTamano(mejor, legal);
}

/** Opciones de reflexión: la liga on-policy refleja 6 asientos por mano y
 * solo debe decaer epsilon y contar la mano una vez (último asiento). */
export interface ReflectOpts {
  decayEpsilon?: boolean;
  cuentaMano?: boolean;
  /** Tasa de decaimiento (default 0.98). La liga usa 0.995: con 6 reflects por
   * mano el suelo 0.1 llegaría en ~18 manos y colapsaría la exploración. */
  epsilonDecay?: number;
}

/** Aprende de la mano: ventaja vs baseline + crédito total a actionHistory.
 *
 * Por qué ventaja y no won/lost: en 6-max la mayoría de manos pierde las
 * ciegas aunque se juegue bien (el héroe gana ~1/6 de botes con estrategia
 * igualada). Castigar toda pérdida empuja todos los priors al suelo 0.05 y
 * enseña que "foldear es malo". Con baseline EMA por situación solo cuenta lo
 * mejor/peor que el coste esperado, y foldear perdiendo como mucho las dos
 * ciegas suma (fold correcto). */
export function reflectOnHand(
  brain: Brain,
  record: HandRecord,
  opts: ReflectOpts = {},
): { brain: Brain; lesson?: Lesson } {
  const decayEpsilon = opts.decayEpsilon ?? true;
  const cuentaMano = opts.cuentaMano ?? true;
  const tasaDecay =
    typeof opts.epsilonDecay === "number" && Number.isFinite(opts.epsilonDecay)
      ? Math.min(0.999, Math.max(0.9, opts.epsilonDecay))
      : EPSILON_DECAY;
  const epsilonAntes = brain.epsilon;
  const claveUltima = claveSituacion(record);
  const historial = record.actionHistory.filter(
    (a) => a.street !== "showdown" && a.street !== "done",
  );
  const delta = Number.isFinite(record.stackDelta) ? record.stackDelta : 0;

  // Baseline EMA de la situación + ventaja normalizada (-1.5…1.5).
  const baselines: Record<string, number> = { ...(brain.baselines ?? {}) };
  const previo = baselines[claveUltima];
  const baseline =
    typeof previo === "number" && Number.isFinite(previo) ? previo : BASE_INICIAL;
  let ventaja = (delta - baseline) / ESCALA_VENTAJA;
  const ultimoItem = historial[historial.length - 1] as
    | { street: string; action: string }
    | undefined;
  const tipoUltAccion = ultimoItem ? parsearAccion(ultimoItem.action)?.tipo : undefined;
  if (tipoUltAccion === "fold" && delta >= GOOD_FOLD_MAX_PERDIDA) {
    ventaja = Math.max(ventaja, GOOD_FOLD_VENTAJA);
  }
  const ventajaC = limitar(ventaja, -1, 1);
  const buena = ventaja > 0;
  baselines[claveUltima] = redondear(baseline + ALFA_BASE * (delta - baseline), 3);

  const priors = { ...brain.priors };
  // Magnitud: botes grandes enseñan más (0.5-1.5).
  const magnitude =
    0.5 + Math.min(1, Math.abs(delta) / Math.max(50, record.potWon + 20));

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
    const step = STEP_VENTAJA * ventajaC * discount * magnitude;
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
  // los tipos NO usados se mueven en -step*0.15 (si la usada fue buena, bajan).
  if (tipoUltimo && n > 0) {
    const stepUltimo = STEP_VENTAJA * ventajaC * 1 * magnitude; // d=0 → discount 1
    const contra = -stepUltimo * CONTRA_PESO;
    for (const tipo of TIPOS) {
      if (tipo === tipoUltimo) continue;
      const anterior = priorConFallback(priors, claveUltima, tipo as BrainAction["type"]);
      const nuevo = limitar(redondear(anterior + contra), PRIOR_MIN, PRIOR_MAX);
      priors[`${claveUltima}/${tipo}`] = nuevo;
    }
  }

  let epsilon = decayEpsilon
    ? Math.max(EPSILON_MIN, redondear(epsilonAntes * tasaDecay, 6))
    : epsilonAntes;
  const handsPlayed = brain.handsPlayed + (cuentaMano ? 1 : 0);
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
      buena,
      anterior: anteriorUltima,
      nuevo: nuevoUltimo,
      handsPlayed,
      magnitude,
      actionsCredited: n,
      strengthBucket: bucketDeRecord(record),
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
    brain: { handsPlayed, lessons, priors, beliefs, epsilon, counts, baselines },
    lesson,
  };
}

/** Prior con fallback V3: directa v3 → sin fuerza (calle/precio/stack/rivales)
 * → calle/cubo/rivales (free→toCall0, cheap/pricey→hasPot) → calle/cubo → 0.5.
 * Las claves V3 no se pre-generan (bajo demanda): si falta, cae al fallback. */
export function priorConFallback(
  priors: Record<string, number>,
  clave: string,
  tipo: BrainAction["type"],
): number {
  const directa = priors[`${clave}/${tipo}`];
  if (directa !== undefined) return directa;
  const partes = clave.split("/");
  if (partes.length === 5) {
    // V3: calle/precio/stack/rivales/fuerza → quita fuerza.
    const [calle, precio, stack, rival] = partes as [string, string, string, string, string];
    const sinFuerza = priors[`${calle}/${precio}/${stack}/${rival}/${tipo}`];
    if (sinFuerza !== undefined) return sinFuerza;
    const cubo = precio === "free" ? "toCall0" : "hasPot";
    const cuboReal =
      precio === "toCall0" || precio === "hasPot" ? precio : cubo;
    const conRivales = priors[`${calle}/${cuboReal}/${rival}/${tipo}`];
    if (conRivales !== undefined) return conRivales;
    const vieja = priors[`${calle}/${cuboReal}/${tipo}`];
    if (vieja !== undefined) return vieja;
    return 0.5;
  }
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

/** Azar ponderado: allin 10%, resto uniforme (evita bingo exploratorio). */
function elegirAzarPonderado(candidatos: BrainAction[]): BrainAction {
  const allins = candidatos.filter((c) => c.type === "allin");
  const resto = candidatos.filter((c) => c.type !== "allin");
  if (allins.length === 0 || resto.length === 0) return elegirAzar(candidatos);
  if (Math.random() < 0.1) return elegirAzar(allins);
  return elegirAzar(resto);
}

interface LessonDatos {
  clave: string;
  tipo: BrainAction["type"];
  importe: number;
  record: HandRecord;
  /** Ventaja>0: la mano salió mejor que el coste esperado (no won binario). */
  buena: boolean;
  anterior: number;
  nuevo: number;
  handsPlayed: number;
  magnitude?: number;
  actionsCredited?: number;
  strengthBucket?: string;
}

function crearLesson(datos: LessonDatos): Lesson {
  const { clave, tipo, importe, record, buena, anterior, nuevo, handsPlayed } = datos;
  const calle = clave.split("/")[0] ?? "preflop";
  const ts = Date.now();
  const base = importe > 0 ? `${tipo} ${importe} en ${calle}` : `${tipo} en ${calle}`;
  const situation = `${base} ${contextoSituacion(record, tipo, buena)}`;
  const change =
    nuevo === anterior
      ? `mantuve en ${nuevo.toFixed(2)} la prior de ${VERBOS[tipo]} en ${calle}`
      : `${nuevo > anterior ? "subí" : "bajé"} a ${nuevo.toFixed(2)} la prior de ${
          VERBOS[tipo]
        } en ${calle}`;
  return {
    id: `L${String(handsPlayed).padStart(4, "0")}-${ts}`,
    situation,
    outcome: buena ? "victoria" : "derrota",
    insight: insightDe(buena, tipo),
    change,
    handsPlayed,
    ts,
    ...(typeof datos.magnitude === "number" ? { magnitude: datos.magnitude } : {}),
    ...(typeof datos.actionsCredited === "number"
      ? { actionsCredited: datos.actionsCredited }
      : {}),
    ...(typeof datos.strengthBucket === "string"
      ? { strengthBucket: datos.strengthBucket }
      : {}),
    ...(Number.isFinite(record.stackDelta) ? { stackDelta: record.stackDelta } : {}),
    ...(typeof record.showdown === "boolean" ? { showdown: record.showdown } : {}),
  };
}

/** Bucket global del record para la Lesson (informativo, try/catch → "mid"). */
function bucketDeRecord(record: HandRecord): string {
  try {
    return bucketFuerza(estimateCardStrength(record.myCards, record.board));
  } catch {
    return "mid";
  }
}

function contextoSituacion(
  record: HandRecord,
  tipo: BrainAction["type"],
  buena: boolean,
): string {
  if (record.showdown) return "y fuimos a showdown";
  if (buena) return "sin enseñar cartas";
  if (tipo === "call") return "sin mostrarme fuerza";
  if (tipo === "fold") return "dejé la mano";
  return "y lo resolví en la calle";
}

function insightDe(buena: boolean, tipo: BrainAction["type"]): string {
  if (buena) {
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


