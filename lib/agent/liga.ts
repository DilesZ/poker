// Liga autónoma on-policy: el cerebro juega LOS 6 ASIENTOS contra sí mismo.
// Sin humanos, sin heurística fija: cada asiento decide vía chooseBrainAction
// con sus cartas reales y al cerrar se reflejan los 6 (ventaja por delta
// propio). Solo cuenta 1 mano y decae epsilon 1 vez por mano repartida.
// Pura, síncrona, determinista por seed. Para jugar sin el usuario:
// - Servidor: POST/GET /api/agent/liga (+ cron en vercel.json).
// - Local: npm run liga (entrena y sube el cerebro a prod).
import { advanceStreet, deal, newHand, postBlinds, refreshPot, showdown } from "../poker/game";
import type { Card } from "../poker/types";
import { estimateStrength, mulberry32, positionOfSeat, decideFor } from "../training/selfplay";
import { cloneStrategy, DEFAULT_STRATEGY } from "../training/strategy";
import { buildHandRecord, type AccionMano } from "./reflection";
import {
  chooseBrainAction,
  reflectOnHand,
  type Brain,
  type BrainContext,
  type BrainLegal,
} from "./brain";
import { dreamConsolidate } from "./dream";

export interface LigaOpts {
  hands?: number;
  seed?: number;
  /** Cada cuántas manos sueña (default 25, n=5). 0 = sin sueño. */
  dreamCada?: number;
  /** Replay priorizado por |ventaja| (default true). Re-juega las manos que
   * más enseñan en vez de solo la última: +8 reflects/25 manos (~+5% CPU). */
  replay?: boolean;
  /** Asiento exploiter con heurística fija (default null = apagado). Rompe el
   * espejo: 6 cerebros idénticos co-adaptan y coluden; un rival fijo distinto
   * enseña a explotarlo. No se refleja (no contamina al cerebro). */
  exploiterSeat?: number | null;
  /** Snapshot trailing cada N manos (default 0 = apagado). Los asientos 1 y 3
   * juegan con un clon congelado (fictitious play de ventana corta): el cerebro
   * aprende contra su propio pasado reciente en vez de contra su presente. */
  snapshotCada?: number;
}

export interface LigaStats {
  hands: number;
  /** Suma de bb de los 6 (cero-sum: debe ≈0; si no, hay bug de fichas). */
  sumaBB: number;
  showdownPct: number;
  reflects: number;
  priorsMovidos: number;
  /** Asientos que aprenden por mano (6 base; menos con exploiter/snapshot). */
  asientosVivos?: number;
}

export interface LigaResult {
  brain: Brain;
  stats: LigaStats;
}

const RANGOS: Record<number, string> = { 11: "J", 12: "Q", 13: "K", 14: "A" };

function cartaCorta(c: Card): string {
  return `${RANGOS[c.rank] ?? c.rank}${c.suit}`;
}

type TipoMano = "fold" | "check" | "call" | "raise" | "allin";

interface Traza {
  historial: AccionMano[];
  calleFinal: string;
}

/** Aplica la decisión del cerebro al estado (devuelve tipo registrado). */
function aplicarDecision(
  e: {
    players: { id: number; bet: number; stack: number; folded: boolean; allIn: boolean }[];
    currentBet: number;
    pot: number;
  },
  refresh: () => void,
  pid: number,
  tipo: TipoMano,
  size: number | undefined,
  toCall: number,
  invested: number[],
): { tipo: TipoMano; cantidad: number } {
  const p = e.players.find((x) => x.id === pid);
  if (!p) return { tipo: "check", cantidad: 0 };
  if (tipo === "fold") {
    p.folded = true;
    return { tipo: "fold", cantidad: 0 };
  }
  if (tipo === "check") {
    if (toCall > 0) {
      p.folded = true;
      return { tipo: "fold", cantidad: 0 };
    }
    return { tipo: "check", cantidad: 0 };
  }
  if (tipo === "call") {
    const pay = Math.min(p.stack, Math.max(0, toCall));
    p.stack -= pay;
    p.bet += pay;
    invested[pid] = (invested[pid] ?? 0) + pay;
    if (p.stack === 0) p.allIn = true;
    refresh();
    return { tipo: p.allIn && pay >= toCall && toCall > 0 ? "allin" : "call", cantidad: pay };
  }
  if (tipo === "raise") {
    const deseada = typeof size === "number" ? size : Math.max(e.currentBet + 1, Math.round(e.pot * 0.5));
    const objetivo = Math.min(Math.max(Math.floor(deseada), e.currentBet + 1), p.bet + p.stack);
    const cantidad = Math.max(0, objetivo - p.bet);
    p.stack -= cantidad;
    p.bet += cantidad;
    invested[pid] = (invested[pid] ?? 0) + cantidad;
    if (p.stack === 0) p.allIn = true;
    // Sin esto currentBet se quedaba en la BB toda la mano: los precios eran
    // ficticios (todos pagaban la BB) y los datos de entrenamiento, irreales.
    const subio = p.bet > e.currentBet;
    if (subio) e.currentBet = p.bet;
    refresh();
    if (!subio) return { tipo: "call", cantidad };
    return { tipo: p.stack === 0 ? "allin" : "raise", cantidad };
  }
  const pay = p.stack;
  p.stack = 0;
  p.allIn = true;
  p.bet += pay;
  invested[pid] = (invested[pid] ?? 0) + pay;
  if (p.bet > e.currentBet) e.currentBet = p.bet;
  refresh();
  return { tipo: "allin", cantidad: pay };
}

function clonarBrain(b: Brain): Brain {
  return {
    handsPlayed: b.handsPlayed,
    lessons: [...b.lessons],
    priors: { ...b.priors },
    beliefs: [...b.beliefs],
    epsilon: b.epsilon,
    counts: { ...(b.counts ?? {}) },
    baselines: { ...(b.baselines ?? {}) },
  };
}

function contarMovidos(priors: Record<string, number>): number {
  let n = 0;
  for (const v of Object.values(priors)) if (v !== 0.5) n++;
  return n;
}

/**
 * Juega `hands` manos con el cerebro en los 6 asientos y lo devuelve entrenado.
 * No muta el brain de entrada. 1000 manos ≈ 5-10s.
 */
export function jugarLiga(base: Brain, opts: LigaOpts = {}): LigaResult {
  const nHands = opts.hands ?? 500;
  const seed = opts.seed ?? 777;
  const dreamCada = opts.dreamCada ?? 25;
  const NUM = 6;
  const STACK = 1000;
  const SB = 10;
  const BB = 20;
  const STREETS = ["preflop", "flop", "turn", "river"] as const;
  const exp = opts.exploiterSeat;
  const exploiterSeat =
    typeof exp === "number" && Number.isInteger(exp) && exp >= 0 && exp < NUM ? exp : null;
  const snapshotCada =
    typeof opts.snapshotCada === "number" && Number.isFinite(opts.snapshotCada) && opts.snapshotCada > 0
      ? Math.floor(opts.snapshotCada)
      : 0;
  // Asientos congelados al snapshot (fictitious play): fijos para que las
  // claves sean comparables entre ventanas.
  const SNAP_SEATS = [1, 3];
  const vivosFinal =
    NUM -
    (exploiterSeat === null ? 0 : 1) -
    (snapshotCada > 0 ? SNAP_SEATS.filter((s) => s !== exploiterSeat).length : 0);

  if (!Number.isInteger(nHands) || nHands <= 0) {
    const clon = clonarBrain(base);
    return {
      brain: clon,
      stats: { hands: 0, sumaBB: 0, showdownPct: 0, reflects: 0, priorsMovidos: contarMovidos(clon.priors) },
    };
  }
  if (!Number.isFinite(seed)) throw new Error("seed debe ser finito");

  let actual = clonarBrain(base);
  const rng = mulberry32(seed >>> 0);
  const originalRandom = Math.random;
  Math.random = rng;
  let sumaBB = 0;
  let showdownCount = 0;
  let reflects = 0;
  // Rival fijo del exploiter + snapshot trailing (fictitious play ventana corta).
  const heuristica = cloneStrategy(DEFAULT_STRATEGY);
  let snap: Brain | null = null;
  // Buffer de replay: últimas 300 reflexiones con su |ventaja| para
  // re-entrenar las que más enseñan (consejo unánime del council).
  const quiReplay = opts.replay ?? true;
  const buf: { rec: Parameters<typeof reflectOnHand>[1]; ventaja: number }[] = [];
  try {
    for (let h = 0; h < nHands; h++) {
      const button = h % NUM;
      if (snapshotCada > 0 && h % snapshotCada === 0) snap = clonarBrain(actual);
      const snapActivo = snapshotCada > 0 && snap !== null;
      const state = newHand(NUM, STACK, SB, BB, button);
      // Baseline PRE-ciegas (1000 por asiento): los deltas incluyen el coste de
      // las ciegas y la suma por mano es cero-sum. Si se capturase post-ciegas,
      // cada mano sumaría +30 fichas (+1.5bb) de artefacto.
      const stackInicio = state.players.map((p) => p.stack);
      postBlinds(state);
      deal(state);
      refreshPot(state);
      const trazas: Traza[] = state.players.map(() => ({ historial: [], calleFinal: "preflop" }));
      let invested = new Array<number>(NUM).fill(0);
      const sbIdx = (button + 1) % NUM;
      const bbIdx = (button + 2) % NUM;
      invested[sbIdx] = Math.min(SB, state.players[sbIdx]?.bet ?? 0);
      invested[bbIdx] = Math.min(BB, state.players[bbIdx]?.bet ?? 0);

      let handOver = false;
      let reachedShowdown = false;
      const e = state as unknown as Parameters<typeof aplicarDecision>[0];

      for (let si = 0; si < STREETS.length && !handOver; si++) {
        for (let pass = 0; pass < 3 && !handOver; pass++) {
          const startOffset = si === 0 ? 3 : 1;
          let raisedThisPass = false;
          for (let k = 0; k < NUM; k++) {
            const idx = (button + startOffset + k) % NUM;
            const p = state.players[idx];
            if (!p || p.folded || p.allIn) continue;
            let activos = 0;
            for (const q of state.players) if (!q.folded) activos++;
            if (activos <= 1) {
              handOver = true;
              break;
            }
            const toCall = Math.max(0, state.currentBet - (invested[p.id] ?? 0));
            const strength = estimateStrength(p.hole, state.board);
            const inv = invested[p.id] ?? 0;
            const esExploiter = p.id === exploiterSeat;
            const congelado = !esExploiter && snapActivo && SNAP_SEATS.includes(p.id);
            const cerebro = congelado && snap ? snap : actual;
            if (esExploiter) {
              // Rival fijo heurístico: se juega pero no aprende ni enseña.
              const pos = positionOfSeat(p.id, button, NUM);
              const ha = decideFor(p.id, strength, toCall, state.pot, p.stack, BB, pos, heuristica);
              const tipoH: TipoMano =
                ha.action === "bet" ? "raise" : ha.action === "all-in" ? "allin" : ha.action;
              const sizeH = ha.action === "bet" ? toCall + (ha.amount ?? 0) : undefined;
              const nivelAntesH = state.currentBet;
              aplicarDecision(e, () => refreshPot(state), p.id, tipoH, sizeH, toCall, invested);
              if (p.bet > nivelAntesH) raisedThisPass = true;
              continue;
            }
            const candidates: BrainLegal["candidates"] = [];
            if (toCall > 0) candidates.push({ type: "fold" });
            else candidates.push({ type: "check" });
            if (toCall > 0 && p.stack > toCall) candidates.push({ type: "call" });
            if (inv + p.stack > state.currentBet) candidates.push({ type: "raise" });
            if (p.stack > 0) candidates.push({ type: "allin" });
            const legal = { candidates, toCall, pot: state.pot, stack: p.stack, bb: BB } as BrainLegal;
            let rivales = 0;
            for (const q of state.players) if (q.id !== p.id && !q.folded) rivales++;
            const ctx = {
              street: STREETS[si] ?? "preflop",
              boardLen: state.board.length,
              myStack: p.stack,
              pot: state.pot,
              toCall,
              numRivales: rivales,
              strength,
            } as BrainContext;
            const ba = chooseBrainAction(cerebro, legal, ctx);
            const nivelAntes = state.currentBet;
            const reg = aplicarDecision(
              e,
              () => refreshPot(state),
              p.id,
              ba.type,
              ba.size,
              toCall,
              invested,
            );
            if (p.bet > nivelAntes) raisedThisPass = true;
            const tr = trazas[p.id];
            if (tr) {
              tr.historial.push({
                street: STREETS[si] ?? "preflop",
                type: reg.tipo,
                ...(reg.cantidad > 0 ? { amount: reg.cantidad } : {}),
                ...(toCall > 0 ? { toCall } : {}),
              });
              tr.calleFinal = STREETS[si] ?? "preflop";
            }
          }
          const rest = state.players.filter((q) => !q.folded);
          if (rest.length <= 1) {
            handOver = true;
            break;
          }
          if (!raisedThisPass) break;
        }
        const rest = state.players.filter((q) => !q.folded);
        if (rest.length <= 1) {
          handOver = true;
          break;
        }
        if (si < STREETS.length - 1) {
          advanceStreet(state);
          state.currentBet = 0;
          invested = new Array<number>(NUM).fill(0);
        }
      }

      const survivors = state.players.filter((q) => !q.folded);
      if (!handOver && survivors.length > 1) {
        showdown(state);
        reachedShowdown = true;
      } else if (survivors.length === 1) {
        const w = survivors[0];
        if (w) {
          refreshPot(state);
          w.stack += state.pot;
        }
      } else {
        showdown(state);
        reachedShowdown = true;
      }
      if (reachedShowdown) showdownCount++;

      // Reflexión on-policy: cada asiento VIVO aprende de su propio delta.
      // Ni el exploiter (heurística fija) ni los congelados (snapshot) aprenden.
      const vivos: number[] = [];
      for (let s = 0; s < NUM; s++) {
        if (s === exploiterSeat) continue;
        if (snapActivo && SNAP_SEATS.includes(s)) continue;
        vivos.push(s);
      }
      const ultimoVivo = vivos[vivos.length - 1] ?? -1;
      // Cero-sum sobre TODOS los asientos (incluye exploiter/congelados).
      for (let s = 0; s < NUM; s++) {
        const pl = state.players[s];
        if (!pl) continue;
        sumaBB += (pl.stack - (stackInicio[s] ?? STACK)) / BB;
      }
      const boardTxt = state.board.map(cartaCorta).join(" ");
      for (const s of vivos) {
        const pl = state.players[s];
        const tr = trazas[s];
        if (!pl || !tr) continue;
        const delta = pl.stack - (stackInicio[s] ?? STACK);
        const ultimo = s === ultimoVivo;
        const rec = buildHandRecord({
          won: delta > 0,
          myCards: pl.hole.map(cartaCorta).join(" "),
          board: boardTxt,
          street: tr.calleFinal,
          actions: tr.historial,
          showdown: reachedShowdown,
          potWon: Math.max(0, delta),
          stackDelta: delta,
          numRivales: NUM - 1,
        });
        const r = reflectOnHand(actual, rec, {
          decayEpsilon: ultimo,
          cuentaMano: ultimo,
          epsilonDecay: 0.995,
        });
        actual = r.brain;
        reflects++;
        if (quiReplay) {
          buf.push({ rec, ventaja: r.ventaja });
          if (buf.length > 300) buf.shift();
        }
      }

      // Replay priorizado cada 25 manos, independiente del sueño: top-8 por
      // |ventaja|, sin decaer ni contar (la mano ya contó). Determinista:
      // inserción ordenada + sort estable.
      if (quiReplay && (h + 1) % 25 === 0 && buf.length > 0) {
        const top = [...buf]
          .sort((a, b) => Math.abs(b.ventaja) - Math.abs(a.ventaja))
          .slice(0, 8);
        for (const item of top) {
          const rr = reflectOnHand(actual, item.rec, {
            decayEpsilon: false,
            cuentaMano: false,
          });
          actual = rr.brain;
          reflects++;
        }
      }
      if (dreamCada > 0 && (h + 1) % dreamCada === 0) {
        try {
          const tr0 = trazas[0];
          const pl0 = state.players[0];
          if (tr0 && pl0) {
            const rec = buildHandRecord({
              won: (pl0.stack - (stackInicio[0] ?? STACK)) > 0,
              myCards: pl0.hole.map(cartaCorta).join(" "),
              board: boardTxt,
              street: tr0.calleFinal,
              actions: tr0.historial,
              showdown: reachedShowdown,
              potWon: 0,
              stackDelta: pl0.stack - (stackInicio[0] ?? STACK),
              numRivales: NUM - 1,
            });
            actual = dreamConsolidate(actual, rec, 5, (seed ^ (h + 1)) >>> 0);
          }
        } catch {
          // el sueño nunca rompe la liga
        }
      }
    }
  } finally {
    Math.random = originalRandom;
  }
  return {
    brain: actual,
    stats: {
      hands: nHands,
      sumaBB: Math.round(sumaBB * 100) / 100,
      showdownPct: nHands > 0 ? showdownCount / nHands : 0,
      reflects,
      priorsMovidos: contarMovidos(actual.priors),
      asientosVivos: vivosFinal,
    },
  };
}

