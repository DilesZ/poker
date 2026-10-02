// Dream consolidation: re-juega el último registro con variaciones para
// consolidar priors sin jugar manos reales. Puro, sin I/O, sin Math.random
// global (usa mulberry32 local). Solo muta priors.
import { reflectOnHand, type Brain, type HandRecord } from "./brain";
import { claveSituacion, parsearAccion } from "./reflection";

const TIPOS = ["fold", "check", "call", "raise", "allin"] as const;
const PRIOR_MAX = 0.95;

/** PRNG local determinista (mulberry32). No usa Math.random global. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function variarRegistro(rec: HandRecord, rng: () => number): HandRecord {
  const won = rng() < 0.15 ? !rec.won : rec.won;
  const jitter = 1 + (rng() * 0.4 - 0.2);
  const stackDelta =
    typeof rec.stackDelta === "number" ? Math.round(rec.stackDelta * jitter) : rec.stackDelta;
  let numRivales = rec.numRivales;
  if (typeof numRivales === "number") {
    const esHU = numRivales <= 1;
    const flip = rng() < 0.5;
    const quiereHU = flip ? !esHU : esHU;
    numRivales = quiereHU ? (rng() < 0.5 ? 0 : 1) : 2 + Math.floor(rng() * 4);
  } else {
    numRivales = rng() < 0.5 ? (rng() < 0.5 ? 0 : 1) : 2 + Math.floor(rng() * 4);
  }
  return {
    ...rec,
    won,
    stackDelta,
    numRivales,
    actionHistory: [...rec.actionHistory],
  };
}

/**
 * Refuerzo contrafactual: si ganó, sube +0.01 la mejor acción NO tomada.
 * Forma 3 args (priors, brain, record): muta priors in-place.
 * Forma 2 args (brain, record): devuelve Brain nuevo.
 */
export function counterfactualDream(
  priorsOBrain: Record<string, number> | Brain,
  brainORecord: Brain | HandRecord,
  recordMaybe?: HandRecord,
): Brain | void {
  if (recordMaybe && typeof priorsOBrain === "object" && !("handsPlayed" in (priorsOBrain as object))) {
    const priors = priorsOBrain as Record<string, number>;
    const record = recordMaybe;
    if (!record.won) return;
    try {
      const clave = claveSituacion(record);
      const ultima = record.actionHistory[record.actionHistory.length - 1];
      const parseo = ultima ? parsearAccion(ultima.action) : null;
      const tomada = parseo?.tipo;
      let mejor: string | null = null;
      let mejorV = Number.NEGATIVE_INFINITY;
      for (const t of TIPOS) {
        if (t === tomada) continue;
        const v = priors[`${clave}/${t}`] ?? 0.5;
        if (v > mejorV) {
          mejorV = v;
          mejor = t;
        }
      }
      if (!mejor) return;
      const key = `${clave}/${mejor}`;
      const actual = priors[key] ?? 0.5;
      priors[key] = Math.min(PRIOR_MAX, Math.round((actual + 0.01) * 1000) / 1000);
    } catch {
      // best-effort
    }
    return;
  }
  const brain = priorsOBrain as Brain;
  const record = brainORecord as HandRecord;
  if (!brain || !record || !record.won) return brain;
  try {
    const clave = claveSituacion(record);
    const ultima = record.actionHistory[record.actionHistory.length - 1];
    const parseo = ultima ? parsearAccion(ultima.action) : null;
    const tomada = parseo?.tipo;
    let mejor: string | null = null;
    let mejorV = Number.NEGATIVE_INFINITY;
    for (const t of TIPOS) {
      if (t === tomada) continue;
      const v = brain.priors[`${clave}/${t}`] ?? 0.5;
      if (v > mejorV) {
        mejorV = v;
        mejor = t;
      }
    }
    if (!mejor) return brain;
    const key = `${clave}/${mejor}`;
    const actual = brain.priors[key] ?? 0.5;
    const priors = {
      ...brain.priors,
      [key]: Math.min(PRIOR_MAX, Math.round((actual + 0.01) * 1000) / 1000),
    };
    return { ...brain, priors };
  } catch {
    return brain;
  }
}

/**
 * Consolida el cerebro repitiendo reflectOnHand sobre variaciones del último
 * registro. Solo consolida priors (handsPlayed/lessons/epsilon/counts se
 * conservan del original) para no inflar la experiencia soñada.
 */
export function dreamConsolidate(
  brain: Brain,
  lastRecord: HandRecord,
  n = 200,
  seed = 0xc0ffee,
): Brain {
  if (!brain || !lastRecord) return brain;
  if (n <= 0) return { ...brain, priors: { ...brain.priors } };
  const rng = mulberry32(seed >>> 0);
  let priors: Record<string, number> = { ...brain.priors };
  for (let i = 0; i < n; i++) {
    const variado = variarRegistro(lastRecord, rng);
    const tmp: Brain = { ...brain, priors };
    const res = reflectOnHand(tmp, variado);
    priors = res.brain.priors;
  }
  const finalPriors = { ...priors };
  counterfactualDream(finalPriors, brain, lastRecord);
  return { ...brain, priors: finalPriors };
}
