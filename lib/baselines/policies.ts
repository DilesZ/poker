// Siete políticas baseline deterministas dado rng. Español. Cero dependencias.
// Solo leen `info` (InformationSet) y el `rng` inyectado: SIN Math.random,
// SIN Date.now, SIN acceso a nada fuera de esos dos argumentos.
//
// Supuestos documentados (limitaciones del infoset):
// - La ciega grande no viene en el infoset: se asume BB = 20 (estándar del motor).
// - Preflop "open": STANDARD_ABSTRACTION solo ofrece 2.5bb (50) como apuesta de
//   apertura; los raises usan minRaiseTo (mínimo legal). El open 3bb del maníaco
//   se aproxima con pickClosest sobre los candidatos (documentado en su política).
// - currentBet no viene directo: se deriva como max(betsStreet, 0) y el
//   incremento mínimo como minRaiseTo - currentBet (con suelo BB=20).
// - Todas las decisiones se eligen SIEMPRE dentro de candidatas(info), es decir,
//   dentro de expandActions(STANDARD): nunca devuelven una acción ilegal.
// - Faroles y mezclas (mix) consumen rng() en orden fijo: misma semilla +
//   mismo infoset ⇒ misma acción.
import type { EngineAction } from "@/lib/engine/types";
import type { InformationSet } from "@/lib/engine/infoset";
import { STANDARD_ABSTRACTION, expandActions } from "@/lib/engine/actions";
import { madeCategory, preflopTier } from "./strength";

/** Firma de decisión de una política: infoset + azar inyectado. */
export type Decide = (info: InformationSet, rng: () => number) => EngineAction;

/** Ciega grande asumida (no está en el infoset; estándar del motor). */
export const BB = 20;

/**
 * Candidatos legales bajo la abstracción estándar (bb = 20).
 * currentBet = max(betsStreet); incremento = minRaiseTo - currentBet (suelo BB).
 * Si la expansión saliera vacía (infoset degenerado), red de seguridad:
 * check > call > fold > allin.
 */
export function candidatas(info: InformationSet): EngineAction[] {
  const actual = info.betsStreet.length > 0 ? Math.max(...info.betsStreet) : 0;
  const incremento = info.legal.canRaise ? Math.max(1, info.minRaiseTo - actual) : BB;
  const lista = expandActions(
    info.legal,
    info.street,
    BB,
    info.pot,
    STANDARD_ABSTRACTION,
    actual,
    incremento,
  );
  if (lista.length > 0) return lista;
  if (info.legal.canCheck) return [{ type: "check" }];
  if (info.legal.canCall) return [{ type: "call" }];
  if (info.legal.canFold) return [{ type: "fold" }];
  return [{ type: "allin" }];
}

/**
 * Elige, entre los candidatos del tipo deseado ("bet" o "raise"), el de importe
 * más cercano al objetivo. Empate ⇒ el menor (los candidatos vienen ordenados).
 * Devuelve undefined si no hay ningún candidato de ese tipo.
 */
export function pickClosest(
  candidatos: EngineAction[],
  tipoDeseado: "bet" | "raise",
  objetivo: number,
): EngineAction | undefined {
  let mejor: EngineAction | undefined = undefined;
  let mejorDist = Infinity;
  for (const c of candidatos) {
    let importe: number | null = null;
    if (c.type === tipoDeseado) importe = c.type === "bet" ? c.amount : c.to;
    if (importe === null) continue;
    const dist = Math.abs(importe - objetivo);
    if (dist < mejorDist) {
      mejorDist = dist;
      mejor = c;
    }
  }
  return mejor;
}

/** ¿Hay algún candidato de ese tipo? */
function hay(cands: EngineAction[], tipo: EngineAction["type"]): EngineAction | undefined {
  return cands.find((c) => c.type === tipo);
}

/** El bet/raise más barato disponible (los candidatos vienen ordenados). */
function masBarata(cands: EngineAction[], tipo: "bet" | "raise"): EngineAction | undefined {
  return cands.find((c) => c.type === tipo);
}

/** Línea pasiva de emergencia: check > call > fold > allin > primer candidato. */
function pasiva(cands: EngineAction[]): EngineAction {
  return (
    hay(cands, "check") ??
    hay(cands, "call") ??
    hay(cands, "fold") ??
    hay(cands, "allin") ??
    (cands[0] as EngineAction)
  );
}

/** Igualar si hay apuesta y pasar si es gratis (sin faroles ni subidas). */
function pasarOIgluar(cands: EngineAction[]): EngineAction {
  return hay(cands, "check") ?? hay(cands, "call") ?? pasiva(cands);
}

/**
 * Agresión mínima: raise más cercano al mínimo legal; si no hay raise (spot sin
 * apuesta previa), el open/bet más barato; si no hay ni eso, línea pasiva.
 * Preflop equivale al min-open (limitación documentada: STANDARD solo da 2.5bb).
 */
function agresionMinima(cands: EngineAction[], info: InformationSet): EngineAction {
  if (info.toCall > 0) {
    return pickClosest(cands, "raise", info.minRaiseTo) ?? pasarOIgluar(cands);
  }
  return masBarata(cands, "bet") ?? pasarOIgluar(cands);
}

/** Foldear si hay que pagar; pasar/igualar si sale gratis. */
function foldOPasiva(cands: EngineAction[], info: InformationSet): EngineAction {
  if (info.toCall > 0) return hay(cands, "fold") ?? pasarOIgluar(cands);
  return pasarOIgluar(cands);
}

/** Igualar hasta un tope; si es gratis pasar; si excede, fold. */
function igualarHasta(
  cands: EngineAction[],
  info: InformationSet,
  tope: number,
): EngineAction {
  if (info.toCall <= 0) return pasarOIgluar(cands);
  if (info.toCall <= tope) return hay(cands, "call") ?? pasiva(cands);
  return hay(cands, "fold") ?? pasiva(cands);
}

/** Categoría postflop de hole+board (-1 si aún sin board completo: se trata como aire). */
function categoriaPostflop(info: InformationSet): number {
  return madeCategory([...info.hole, ...info.board]);
}

/** Apuesta de valor: bet más cercano a fracción×pot si gratis; min-raise si hay apuesta. */
function apuestaValor(
  cands: EngineAction[],
  info: InformationSet,
  fraccion: number,
): EngineAction {
  if (info.toCall <= 0) {
    return pickClosest(cands, "bet", Math.round(fraccion * info.pot)) ?? pasarOIgluar(cands);
  }
  return (
    pickClosest(cands, "raise", info.minRaiseTo) ?? hay(cands, "call") ?? pasiva(cands)
  );
}

// ---------------------------------------------------------------------------
// 1) random: uniforme sobre los candidatos.
// ---------------------------------------------------------------------------
export const decideRandom: Decide = (info, rng) => {
  const cands = candidatas(info);
  const i = Math.min(cands.length - 1, Math.floor(rng() * cands.length));
  return cands[i] as EngineAction;
};

// ---------------------------------------------------------------------------
// 2) calling-station: nunca foldea barato; solo fold si toCall > 30% del stack.
//    Si sale gratis, 5% de las veces mete el bet mínimo (resto check).
// ---------------------------------------------------------------------------
export const decideCallingStation: Decide = (info, rng) => {
  const cands = candidatas(info);
  if (info.toCall > 0) {
    if (info.toCall > 0.3 * info.stackHero) return hay(cands, "fold") ?? pasiva(cands);
    return hay(cands, "call") ?? pasiva(cands);
  }
  if (hay(cands, "bet") && rng() < 0.05) return masBarata(cands, "bet") as EngineAction;
  return pasarOIgluar(cands);
};

// ---------------------------------------------------------------------------
// 3) nit (roca): solo premium. Preflop tier≤2 raise-min; tier3 call si ≤3bb;
//    resto fold. Postflop: two-pair+ (cat≥2) bet 50%; pareja call si ≤25% pot;
//    aire check/fold (si es gratis eso es check; nunca "iguala gratis": foldea).
// ---------------------------------------------------------------------------
export const decideNit: Decide = (info, rng) => {
  void rng; // El nit es 100% determinista: ignora el azar.
  const cands = candidatas(info);
  if (info.street === "preflop") {
    const tier = preflopTier(info.hole);
    if (tier <= 2) return agresionMinima(cands, info);
    if (tier === 3) return igualarHasta(cands, info, 3 * BB);
    return foldOPasiva(cands, info);
  }
  const cat = categoriaPostflop(info);
  if (cat >= 2) return apuestaValor(cands, info, 0.5);
  if (cat === 1) {
    if (info.toCall <= 0) return pasarOIgluar(cands);
    return igualarHasta(cands, info, 0.25 * info.pot);
  }
  return foldOPasiva(cands, info);
};

// ---------------------------------------------------------------------------
// 4) tag: como el nit pero más ancho. Preflop tier≤2 open/3bet; tier3 call ≤4bb;
//    resto fold salvo BB que defiende tier≤4 si ≤2bb. Postflop: valor bet 66%.
// ---------------------------------------------------------------------------
export const decideTag: Decide = (info, rng) => {
  void rng; // Determinista: ignora el azar.
  const cands = candidatas(info);
  if (info.street === "preflop") {
    const tier = preflopTier(info.hole);
    if (tier <= 2) return agresionMinima(cands, info);
    if (tier === 3) return igualarHasta(cands, info, 4 * BB);
    if (info.position === "BB" && tier <= 4 && info.toCall > 0 && info.toCall <= 2 * BB) {
      return hay(cands, "call") ?? pasiva(cands);
    }
    return foldOPasiva(cands, info);
  }
  const cat = categoriaPostflop(info);
  if (cat >= 2) return apuestaValor(cands, info, 0.66);
  if (cat === 1) {
    if (info.toCall <= 0) return pasarOIgluar(cands);
    return igualarHasta(cands, info, 0.25 * info.pot);
  }
  return foldOPasiva(cands, info);
};

// ---------------------------------------------------------------------------
// 5) lag: juega casi todo. Preflop tier≤4 open; tier5 foldea 80% (20% call).
//    Postflop: pareja+ (cat≥1) bet 75%; aire farol 30% a 75% del pot.
// ---------------------------------------------------------------------------
export const decideLag: Decide = (info, rng) => {
  const cands = candidatas(info);
  if (info.street === "preflop") {
    const tier = preflopTier(info.hole);
    if (tier <= 4) return agresionMinima(cands, info);
    if (info.toCall <= 0) return pasarOIgluar(cands);
    if (rng() < 0.8) return hay(cands, "fold") ?? pasiva(cands);
    return hay(cands, "call") ?? pasiva(cands);
  }
  const cat = categoriaPostflop(info);
  if (cat >= 1) return apuestaValor(cands, info, 0.75);
  // Aire: 30% farol (size 75% del pot, como el valor), resto check/fold.
  if (info.toCall <= 0) {
    if (rng() < 0.3) {
      return pickClosest(cands, "bet", Math.round(0.75 * info.pot)) ?? pasarOIgluar(cands);
    }
    return pasarOIgluar(cands);
  }
  return hay(cands, "fold") ?? pasiva(cands);
};

// ---------------------------------------------------------------------------
// 6) maníaco: agresión máxima. Preflop abre 3bb (60) cualquier mano: raise más
//    cercano a 60; si no hay raise, el open disponible (STANDARD solo da 2.5bb,
//    documentado). Postflop bet 75% casi siempre (95%); solo foldea all-in con
//    aire (cat<1 y toCall > 50% del stack).
// ---------------------------------------------------------------------------
export const decideManiac: Decide = (info, rng) => {
  const cands = candidatas(info);
  if (info.street === "preflop") {
    if (info.toCall > 0) {
      return pickClosest(cands, "raise", 3 * BB) ?? hay(cands, "call") ?? pasiva(cands);
    }
    return masBarata(cands, "bet") ?? pasarOIgluar(cands);
  }
  const cat = categoriaPostflop(info);
  if (info.toCall > 0) {
    if (cat < 1 && info.toCall > 0.5 * info.stackHero) {
      return hay(cands, "fold") ?? pasiva(cands);
    }
    return (
      pickClosest(cands, "raise", info.minRaiseTo) ?? hay(cands, "call") ?? pasiva(cands)
    );
  }
  if (rng() < 0.95) {
    return pickClosest(cands, "bet", Math.round(0.75 * info.pot)) ?? pasarOIgluar(cands);
  }
  return pasarOIgluar(cands);
};

// ---------------------------------------------------------------------------
// 7) gto-lite: heurística con sabor a rangos. AVISO: NO es GTO ni equilibrio:
//    son reglas fijas (tiers + pot-odds) sin resolver nada. Preflop tier1 raise,
//    tier2 mix 50% raise/call, tier3 call ≤3bb. Postflop: valor bet 50-75% (rng),
//    pareja call si pot-odds ≤ 0.25, aire check/fold.
// ---------------------------------------------------------------------------
export const decideGtoLite: Decide = (info, rng) => {
  const cands = candidatas(info);
  if (info.street === "preflop") {
    const tier = preflopTier(info.hole);
    if (tier === 1) return agresionMinima(cands, info);
    if (tier === 2) {
      if (rng() < 0.5) return agresionMinima(cands, info);
      return igualarHasta(cands, info, info.stackHero); // 50% call (casi) siempre
    }
    if (tier === 3) return igualarHasta(cands, info, 3 * BB);
    return foldOPasiva(cands, info);
  }
  const cat = categoriaPostflop(info);
  if (cat >= 2) {
    const fraccion = 0.5 + rng() * 0.25; // 50-75% del pot
    return apuestaValor(cands, info, fraccion);
  }
  if (cat === 1) {
    if (info.toCall <= 0) return pasarOIgluar(cands);
    const potOdds = info.toCall / (info.pot + info.toCall);
    if (potOdds <= 0.25) return hay(cands, "call") ?? pasiva(cands);
    return hay(cands, "fold") ?? pasiva(cands);
  }
  return foldOPasiva(cands, info);
};
