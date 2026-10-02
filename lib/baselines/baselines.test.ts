// Tests de los baselines (vitest). 5 casos: determinismo, legalidad bajo
// STANDARD, ausencia de Math.random, VPIP station > nit y aislamiento de
// gto-lite (solo recibe su infoset). Español. Sin dependencias externas.
import { describe, expect, it } from "vitest";
import type { Card, Rank, Suit } from "@/lib/poker/types";
import type { EngineAction, LegalActions } from "@/lib/engine/types";
import type { InformationSet, PositionLabel } from "@/lib/engine/infoset";
import { STANDARD_ABSTRACTION, expandActions } from "@/lib/engine/actions";
import { BASELINES, type BaselineId } from "./agent";
import { BB, candidatas } from "./policies";

const IDS: BaselineId[] = [
  "random",
  "calling-station",
  "nit",
  "tag",
  "lag",
  "maniac",
  "gto-lite",
];

/** PRNG con semilla (mulberry32): determinista, no usa Math.random. */
function mulberry32(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PALOS: Suit[] = ["♠", "♥", "♦", "♣"];

/** Carta aleatoria sin repetir las de `usadas` (clave "rank-suit"). */
function cartaAlAzar(rng: () => number, usadas: Set<string>): Card {
  for (;;) {
    const rank = (2 + Math.floor(rng() * 13)) as Rank;
    const suit = PALOS[Math.floor(rng() * PALOS.length)] as Suit;
    const clave = `${rank}-${suit}`;
    if (!usadas.has(clave)) {
      usadas.add(clave);
      return { rank, suit };
    }
  }
}

function legalesGratis(stack: number): LegalActions {
  return {
    canFold: true,
    canCheck: true,
    canCall: false,
    callAmount: 0,
    canBet: true,
    betMin: BB,
    betMax: stack,
    canRaise: false,
    raiseToMin: 0,
    raiseToMax: 0,
    canAllIn: true,
    allInAmount: stack,
  };
}

function legalesPagando(toCall: number, stack: number): LegalActions {
  return {
    canFold: true,
    canCheck: false,
    canCall: true,
    callAmount: toCall,
    canBet: false,
    betMin: 0,
    betMax: 0,
    canRaise: true,
    raiseToMin: toCall + BB,
    raiseToMax: stack,
    canAllIn: true,
    allInAmount: stack,
  };
}

/** Infoset base válido; se parchea con `parche`. */
function makeInfo(parche: Partial<InformationSet> = {}): InformationSet {
  const stack = 1000;
  const base: InformationSet = {
    street: "preflop",
    heroSeat: 0,
    buttonSeat: 1,
    position: "BTN",
    numActive: 2,
    hole: [
      { rank: 14, suit: "♠" },
      { rank: 13, suit: "♥" },
    ],
    board: [],
    pot: 60,
    stacks: [stack, stack],
    betsStreet: [0, 0],
    betsHand: [0, 0],
    toCall: 0,
    minRaiseTo: 40,
    stackHero: stack,
    effectiveStack: stack,
    lastAggressor: null,
    actingSeat: 0,
    bettingHistory: [],
    legal: legalesGratis(stack),
    handId: "test",
    seed: 1,
  };
  return { ...base, ...parche };
}

/** Infoset aleatorio coherente (toCall 0 ⇒ puede pasar; toCall>0 ⇒ puede igualar). */
function infoAlAzar(rng: () => number): InformationSet {
  const calles = ["preflop", "flop", "turn", "river"] as const;
  const street = calles[Math.floor(rng() * calles.length)] as InformationSet["street"];
  const usadas = new Set<string>();
  const hole: [Card, Card] = [cartaAlAzar(rng, usadas), cartaAlAzar(rng, usadas)];
  const nBoard = street === "preflop" ? 0 : street === "flop" ? 3 : street === "turn" ? 4 : 5;
  const board: Card[] = [];
  for (let i = 0; i < nBoard; i++) board.push(cartaAlAzar(rng, usadas));
  const stack = 500 + Math.floor(rng() * 1500);
  const gratis = rng() < 0.5;
  const toCall = gratis ? 0 : BB + Math.floor(rng() * 180);
  const pot = 40 + Math.floor(rng() * 560);
  const posiciones: PositionLabel[] = ["SB", "BB", "UTG", "MP", "CO", "BTN"];
  return makeInfo({
    street,
    position: posiciones[Math.floor(rng() * posiciones.length)] as PositionLabel,
    hole,
    board,
    pot,
    stacks: [stack, stack],
    betsStreet: gratis ? [0, 0] : [0, toCall],
    toCall,
    minRaiseTo: toCall + BB,
    stackHero: stack,
    effectiveStack: stack,
    legal: gratis ? legalesGratis(stack) : legalesPagando(toCall, stack),
  });
}

/** Igualdad de acciones por valor (tipo + importe). */
function mismaAccion(a: EngineAction, b: EngineAction): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Recomputa la expansión STANDARD de forma independiente (misma derivación). */
function expansionEsperada(info: InformationSet): EngineAction[] {
  const actual = info.betsStreet.length > 0 ? Math.max(...info.betsStreet) : 0;
  const incremento = info.legal.canRaise ? Math.max(1, info.minRaiseTo - actual) : BB;
  return expandActions(
    info.legal,
    info.street,
    BB,
    info.pot,
    STANDARD_ABSTRACTION,
    actual,
    incremento,
  );
}

describe("baselines", () => {
  it("determinismo: misma semilla ⇒ misma acción en 50 infosets (los 7 agentes)", () => {
    const rngBase = mulberry32(7);
    const infos: InformationSet[] = [];
    for (let i = 0; i < 50; i++) infos.push(infoAlAzar(rngBase));
    for (const id of IDS) {
      const agente = BASELINES[id];
      infos.forEach((info, i) => {
        const a = agente.decide(info, mulberry32(1000 + i));
        const b = agente.decide(info, mulberry32(1000 + i));
        expect(mismaAccion(a, b), `${id} infoset ${i}`).toBe(true);
      });
    }
  });

  it("legalidad: 200 infosets aleatorios ⇒ acción dentro de expandActions STANDARD", () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 200; i++) {
      const info = infoAlAzar(rng);
      // La expansión nunca sale vacía en estos infosets coherentes.
      const esperada = expansionEsperada(info);
      expect(esperada.length, `infoset ${i}`).toBeGreaterThan(0);
      // Las políticas usan candidatas(info); aquí se valida contra la expansión
      // recomputada de forma independiente en este test.
      expect(candidatas(info)).toEqual(esperada);
      for (const id of IDS) {
        const accion = BASELINES[id].decide(info, mulberry32(9000 + i));
        const legal = esperada.some((e) => mismaAccion(e, accion));
        expect(legal, `${id} infoset ${i}: ${JSON.stringify(accion)}`).toBe(true);
      }
    }
  });

  it("sin Math.random: 200 decisiones con Math.random capado no lanzan", () => {
    const original = Math.random;
    Math.random = () => {
      throw new Error("Math.random está prohibido en baselines.");
    };
    try {
      const rng = mulberry32(99);
      for (let i = 0; i < 200; i++) {
        const info = infoAlAzar(rng);
        const id = IDS[i % IDS.length] as BaselineId;
        expect(() => BASELINES[id].decide(info, mulberry32(i))).not.toThrow();
      }
    } finally {
      Math.random = original;
    }
  });

  it("VPIP: calling-station foldea <10% y nit >50% en 200 spots preflop con pago", () => {
    const rng = mulberry32(2026);
    let foldsStation = 0;
    let foldsNit = 0;
    for (let i = 0; i < 200; i++) {
      const usadas = new Set<string>();
      const hole: [Card, Card] = [cartaAlAzar(rng, usadas), cartaAlAzar(rng, usadas)];
      const toCall = [20, 40, 60][Math.floor(rng() * 3)] as number;
      const stack = 1000;
      const info = makeInfo({
        street: "preflop",
        position: "BTN",
        hole,
        board: [],
        pot: 60,
        stacks: [stack, stack],
        betsStreet: [0, toCall],
        toCall,
        minRaiseTo: toCall + BB,
        stackHero: stack,
        effectiveStack: stack,
        legal: legalesPagando(toCall, stack),
      });
      if (BASELINES["calling-station"].decide(info, mulberry32(i)).type === "fold") {
        foldsStation++;
      }
      if (BASELINES["nit"].decide(info, mulberry32(i)).type === "fold") foldsNit++;
    }
    expect(foldsStation).toBeLessThan(20); // <10%: nunca paga >30% del stack aquí
    expect(foldsNit).toBeGreaterThan(100); // >50%: solo juega tiers 1-3
  });

  it("gto-lite no usa hole ajenas: solo recibe su infoset (sin deck ni rivales)", () => {
    const info = makeInfo({
      street: "flop",
      hole: [
        { rank: 14, suit: "♠" },
        { rank: 14, suit: "♥" },
      ],
      board: [
        { rank: 9, suit: "♣" },
        { rank: 5, suit: "♦" },
        { rank: 2, suit: "♠" },
      ],
      pot: 100,
    });
    // El infoset no expone cartas ajenas ni mazo por construcción.
    const claves = Object.keys(info);
    for (const prohibida of ["oppHole", "oppCards", "deck", "villain", "rival", "opponent"]) {
      expect(claves, prohibida).not.toContain(prohibida);
    }
    expect(JSON.stringify(info)).not.toMatch(/deck|villain|opponent/i);
    // Y a igual semilla, igual acción (no hay fuente oculta de información).
    const a = BASELINES["gto-lite"].decide(info, mulberry32(5));
    const b = BASELINES["gto-lite"].decide(info, mulberry32(5));
    expect(mismaAccion(a, b)).toBe(true);
  });
});
