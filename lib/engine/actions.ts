// Abstracción de acciones configurable del motor (sin lógica de apuestas).
// El motor NO cambia al experimentar: solo se cambian las configuraciones.
// Cero dependencias; únicamente tipos de ./types (import type).
import type { EngineAction, EngineStreet, LegalActions } from "./types";

/** Tamaño de apuesta parametrizable dentro de una abstracción. */
export type BetSize =
  | { kind: "pot"; fraction: number }
  | { kind: "bb"; mult: number }
  | { kind: "min" }
  | { kind: "max" }
  | { kind: "allin" };

/** Espacio de acciones discreto que el agente puede elegir. */
export interface ActionAbstractionConfig {
  id: string;
  description: string;
  /** Apertura preflop expresada en fichas dado el valor de la ciega grande. */
  preflopOpenTo: (bb: number) => number[];
  /** Tamaños de apuesta (donk/continuación) por calle postflop. */
  flopBet: BetSize[];
  turnBet: BetSize[];
  riverBet: BetSize[];
  /** Subidas objetivo en fichas totales dado (apuesta actual, subida mínima). */
  raiseTo: (currentBet: number, minRaise: number) => number[];
  /** Si es cierto, el all-in siempre se ofrece cuando es legal. */
  alwaysAllowAllIn: boolean;
}

/** Abstracción estándar: open 2.5bb; apuestas 33/50/75% del bote; subidas min y min+extra. */
export const STANDARD_ABSTRACTION: ActionAbstractionConfig = {
  id: "standard",
  description:
    "Estándar: apertura 2.5bb; apuestas 33/50/75% del bote; subidas a min-raise y min-raise doble.",
  preflopOpenTo: (bb: number) => [Math.round(2.5 * bb)],
  flopBet: [
    { kind: "pot", fraction: 0.33 },
    { kind: "pot", fraction: 0.5 },
    { kind: "pot", fraction: 0.75 },
  ],
  turnBet: [
    { kind: "pot", fraction: 0.33 },
    { kind: "pot", fraction: 0.5 },
    { kind: "pot", fraction: 0.75 },
  ],
  riverBet: [
    { kind: "pot", fraction: 0.33 },
    { kind: "pot", fraction: 0.5 },
    { kind: "pot", fraction: 0.75 },
  ],
  raiseTo: (currentBet: number, minRaise: number) => [
    currentBet + minRaise,
    currentBet + 2 * minRaise,
  ],
  alwaysAllowAllIn: true,
};

/** Abstracción pequeña: open 2bb; apuesta 50% del bote; solo min-raise. */
export const SMALL_ABSTRACTION: ActionAbstractionConfig = {
  id: "small",
  description: "Pequeña: apertura 2bb; apuesta 50% del bote; solo min-raise.",
  preflopOpenTo: (bb: number) => [Math.round(2 * bb)],
  flopBet: [{ kind: "pot", fraction: 0.5 }],
  turnBet: [{ kind: "pot", fraction: 0.5 }],
  riverBet: [{ kind: "pot", fraction: 0.5 }],
  raiseTo: (currentBet: number, minRaise: number) => [currentBet + minRaise],
  alwaysAllowAllIn: true,
};

/** Abstracción grande: opens 2.5/3.5bb; apuestas 33/66/100/150%; subidas min/2.5x/4x. */
export const LARGE_ABSTRACTION: ActionAbstractionConfig = {
  id: "large",
  description:
    "Grande: aperturas 2.5/3.5bb; apuestas 33/66/100/150% del bote; subidas min, 2.5x y 4x del incremento mínimo.",
  preflopOpenTo: (bb: number) => [Math.round(2.5 * bb), Math.round(3.5 * bb)],
  flopBet: [
    { kind: "pot", fraction: 0.33 },
    { kind: "pot", fraction: 0.66 },
    { kind: "pot", fraction: 1 },
    { kind: "pot", fraction: 1.5 },
  ],
  turnBet: [
    { kind: "pot", fraction: 0.33 },
    { kind: "pot", fraction: 0.66 },
    { kind: "pot", fraction: 1 },
    { kind: "pot", fraction: 1.5 },
  ],
  riverBet: [
    { kind: "pot", fraction: 0.33 },
    { kind: "pot", fraction: 0.66 },
    { kind: "pot", fraction: 1 },
    { kind: "pot", fraction: 1.5 },
  ],
  // 2.5x/4x se interpretan como múltiplos del incremento mínimo sobre la
  // apuesta actual, en coherencia con STANDARD (min = currentBet + minRaise).
  raiseTo: (currentBet: number, minRaise: number) => [
    currentBet + minRaise,
    Math.round(currentBet + 2.5 * minRaise),
    Math.round(currentBet + 4 * minRaise),
  ],
  alwaysAllowAllIn: true,
};

/**
 * Convierte un tamaño abstracto a fichas.
 * pot → fraction*pot redondeado; bb → mult*bb redondeado; min → bb;
 * max/allin → stack. El resultado se redondea y se limita a un mínimo de 1.
 */
export function resolveBetSize(
  size: BetSize,
  pot: number,
  bb: number,
  stack: number,
): number {
  let bruto: number;
  switch (size.kind) {
    case "pot":
      bruto = size.fraction * pot;
      break;
    case "bb":
      bruto = size.mult * bb;
      break;
    case "min":
      bruto = bb;
      break;
    case "max":
    case "allin":
      bruto = stack;
      break;
  }
  return Math.max(1, Math.round(bruto));
}

/** Limita un valor al intervalo [min, max] (ambos inclusive). */
function sujetar(valor: number, min: number, max: number): number {
  if (valor < min) return min;
  if (valor > max) return max;
  return valor;
}

/**
 * Expande las acciones legales a un espacio discreto de EngineAction.
 * - fold/check/call se copian si son legales.
 * - bet: en preflop usa preflopOpenTo(bb); en flop/turn/river resuelve cada
 *   BetSize y lo sujeta a [betMin, betMax]; deduplica y ordena ascendente.
 * - raise: usa cfg.raiseTo(currentBet, minRaise) sujeto a [raiseToMin, raiseToMax].
 * - allin: se añade si cfg.alwaysAllowAllIn y canAllIn (sin duplicados exactos).
 */
export function expandActions(
  legal: LegalActions,
  street: EngineStreet,
  bb: number,
  pot: number,
  cfg: ActionAbstractionConfig,
  currentBet: number,
  minRaise: number,
): EngineAction[] {
  const acciones: EngineAction[] = [];

  if (legal.canFold) acciones.push({ type: "fold" });
  if (legal.canCheck) acciones.push({ type: "check" });
  if (legal.canCall) acciones.push({ type: "call" });

  if (legal.canBet) {
    let cantidades: number[];
    if (street === "preflop") {
      cantidades = cfg.preflopOpenTo(bb).map((abrir) =>
        sujetar(Math.round(abrir), legal.betMin, legal.betMax),
      );
    } else if (street === "flop" || street === "turn" || street === "river") {
      const tamanos =
        street === "flop" ? cfg.flopBet : street === "turn" ? cfg.turnBet : cfg.riverBet;
      cantidades = tamanos.map((t) => {
        // Nota: stack efectivo aproximado con betMax (evita importar betting.ts).
        const resuelto = resolveBetSize(t, pot, bb, legal.betMax);
        return sujetar(resuelto, legal.betMin, legal.betMax);
      });
    } else {
      cantidades = [];
    }
    const unicas = [...new Set(cantidades)].sort((a, b) => a - b);
    for (const amount of unicas) acciones.push({ type: "bet", amount });
  }

  if (legal.canRaise) {
    const objetivos = cfg
      .raiseTo(currentBet, minRaise)
      .map((objetivo) => sujetar(Math.round(objetivo), legal.raiseToMin, legal.raiseToMax));
    const unicos = [...new Set(objetivos)].sort((a, b) => a - b);
    for (const to of unicos) acciones.push({ type: "raise", to });
  }

  if (cfg.alwaysAllowAllIn && legal.canAllIn) {
    const yaExiste = acciones.some((a) => a.type === "allin");
    if (!yaExiste) acciones.push({ type: "allin" });
  }

  return acciones;
}
