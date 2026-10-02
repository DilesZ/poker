// lib/cfr/agent.test.ts — 5 tests del agente CFR preflop con checkpoint
// SINTÉTICO en memoria (vía toCheckpoint + newNode + strategySum manual).
// No toca disco ni usa Math.random. Español.
import { describe, expect, it } from "vitest";
import { BASELINES } from "@/lib/baselines/agent";
import type { InformationSet } from "@/lib/engine/infoset";
import type { LegalActions } from "@/lib/engine/types";
import type { Card } from "@/lib/poker/types";
import { bucketOf } from "@/lib/games/buckets";
import { abstractHistory } from "@/lib/games/holdem-hu";
import { toCheckpoint } from "./checkpoint";
import { newNode, type RegretNode } from "./node";
import { averageFromCheckpoint, createCfrPreflopAgent } from "./agent";

const HOLE_AK: [Card, Card] = [
  { rank: 14, suit: "♠" },
  { rank: 13, suit: "♥" },
];

const LEGAL_PREFLOP_SB: LegalActions = {
  canFold: true,
  canCheck: false,
  canCall: true,
  callAmount: 10,
  canBet: false,
  betMin: 0,
  betMax: 0,
  canRaise: true,
  raiseToMin: 40,
  raiseToMax: 990,
  canAllIn: true,
  allInAmount: 990,
};

function infoPreflopBase(): InformationSet {
  return {
    street: "preflop",
    heroSeat: 0,
    buttonSeat: 0,
    position: "SB",
    numActive: 2,
    hole: [HOLE_AK[0], HOLE_AK[1]],
    board: [],
    pot: 30,
    stacks: [990, 980],
    betsStreet: [10, 20],
    betsHand: [10, 20],
    toCall: 10,
    minRaiseTo: 40,
    stackHero: 990,
    effectiveStack: 980,
    lastAggressor: null,
    actingSeat: 0,
    bettingHistory: [],
    legal: { ...LEGAL_PREFLOP_SB },
    handId: "test-1",
    seed: 7,
  };
}

/** Clave exacta como la construye el agente (misma correspondencia SB→P0). */
function clavePara(info: InformationSet): string {
  const bucket = bucketOf(info.hole[0], info.hole[1]);
  const esSB = info.heroSeat === info.buttonSeat;
  const pos = esSB ? "SB" : "BB";
  const jugador = esSB ? "P0" : "P1";
  const hist = abstractHistory(info.bettingHistory);
  return `HU:${bucket}:${jugador}:${pos}:${hist}`;
}

function nodoConMedia(acciones: string[], strategySum: number[]): RegretNode {
  const nodo = newNode(acciones);
  for (let i = 0; i < nodo.strategySum.length; i++) {
    nodo.strategySum[i] = strategySum[i] ?? 0;
  }
  return nodo;
}

describe("agente CFR preflop", () => {
  it("hit exacto: muestrea la acción de la estrategia media con rng dado", () => {
    const info = infoPreflopBase();
    const clave = clavePara(info);
    // Estrategia degenerada: siempre "call" (s = [0, 10]).
    const nodos = new Map<string, RegretNode>([[clave, nodoConMedia(["fold", "call"], [0, 10])]]);
    const cp = toCheckpoint("v-test", "holdem-hu", 7, 100, nodos, 0, "hash-test", "cfr");
    const agente = createCfrPreflopAgent(cp, "tag");
    const accion = agente.decide(info, () => 0.5);
    expect(accion).toEqual({ type: "call" });
    expect(agente.misses()).toBe(0);
    expect(agente.fallbacksPostflop()).toBe(0);
  });

  it("miss: sin clave delega en el fallback y cuenta misses()==1", () => {
    const info = infoPreflopBase();
    const cp = toCheckpoint("v-test", "holdem-hu", 7, 100, new Map(), 0, "hash-test", "cfr");
    const agente = createCfrPreflopAgent(cp, "tag");
    const rngValor = 0.42;
    const esperado = BASELINES["tag"].decide(info, () => rngValor);
    const obtenido = agente.decide(info, () => rngValor);
    expect(obtenido).toEqual(esperado);
    expect(agente.misses()).toBe(1);
    expect(agente.fallbacksPostflop()).toBe(0);
  });

  it("postflop: delega en el fallback y cuenta fallbacksPostflop()==1", () => {
    const info: InformationSet = {
      ...infoPreflopBase(),
      street: "flop",
      board: [
        { rank: 11, suit: "♣" },
        { rank: 7, suit: "♥" },
        { rank: 2, suit: "♦" },
      ],
    };
    const nodos = new Map<string, RegretNode>([
      [clavePara(infoPreflopBase()), nodoConMedia(["fold", "call"], [0, 10])],
    ]);
    const cp = toCheckpoint("v-test", "holdem-hu", 7, 100, nodos, 0, "hash-test", "cfr");
    const agente = createCfrPreflopAgent(cp, "tag");
    const rngValor = 0.13;
    const esperado = BASELINES["tag"].decide(info, () => rngValor);
    const obtenido = agente.decide(info, () => rngValor);
    expect(obtenido).toEqual(esperado);
    expect(agente.fallbacksPostflop()).toBe(1);
    expect(agente.misses()).toBe(0);
  });

  it("determinismo: misma semilla → misma acción", () => {
    const info = infoPreflopBase();
    const clave = clavePara(info);
    // 50/50 entre fold y call: la acción depende solo de rng().
    const nodos = new Map<string, RegretNode>([[clave, nodoConMedia(["fold", "call"], [5, 5])]]);
    const cp = toCheckpoint("v-test", "holdem-hu", 7, 100, nodos, 0, "hash-test", "cfr");
    const agente = createCfrPreflopAgent(cp, "tag");
    const primera = agente.decide(info, () => 0.7);
    const segunda = agente.decide(info, () => 0.7);
    expect(primera).toEqual(segunda);
  });

  it("estrategia = strategySum normalizada (no regretSum)", () => {
    const nodo = newNode(["fold", "call"]);
    nodo.regretSum[0] = 100;
    nodo.regretSum[1] = 0;
    nodo.strategySum[0] = 1;
    nodo.strategySum[1] = 3;
    const nodos = new Map<string, RegretNode>([["HU:cualquiera:P0:SB:x", nodo]]);
    const cp = toCheckpoint("v-test", "holdem-hu", 7, 100, nodos, 0, "hash-test", "cfr");
    const media = averageFromCheckpoint(cp);
    const entrada = media.get("HU:cualquiera:P0:SB:x");
    expect(entrada?.actions).toEqual(["fold", "call"]);
    // strategySum [1,3] → [0.25, 0.75]; con regretSum sería [1, 0].
    expect(entrada?.probs[0]).toBeCloseTo(0.25, 10);
    expect(entrada?.probs[1]).toBeCloseTo(0.75, 10);
  });
});
