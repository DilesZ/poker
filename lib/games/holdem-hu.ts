// Hold'em HU preflop como juego CFR tabular (TypeScript puro, cero deps).
// Abstracción: 12 buckets de mano inicial (ver buckets.ts) + una sola calle
// de apuestas preflop con acciones abstractas f/x/c/r/a. Sin comunitarias:
// el showdown es un nodo de azar {ganaA, empate, ganaB} con las
// probabilidades hot-cold de la tabla EV (EV = w + t/2).
// Ciegas: en HU el botón es la SB y actúa primero preflop (P0 = SB/BTN por
// defecto; configurable con `button`). Utilidades en fichas netas desde P0,
// zero-sum. Estados inmutables: apply() no muta.
import { CHANCE, type CFRGame, type CFRPlayer, type CFRState } from "../cfr/game";
import { BUCKETS } from "./buckets-data";

export interface HoldemHuConfig {
  sb: number;
  bb: number;
  /** Stack inicial por jugador (ciegas incluidas). */
  stack: number;
  /** Nº máximo de min-raises ("r") por mano; el all-in no tiene tope. */
  maxRaises: number;
  /** Asiento botón (= SB en HU). Por defecto P0. */
  button?: CFRPlayer;
}

export const DEFAULT_HU: HoldemHuConfig = { sb: 1, bb: 2, stack: 200, maxRaises: 3 };

type HuConfig = Required<HoldemHuConfig>;
type Showdown = "ganaA" | "empate" | "ganaB";

function rivalDe(j: CFRPlayer): CFRPlayer {
  return (1 - j) as CFRPlayer;
}

function indiceBucket(accion: string): number {
  const m = /^B(\d+)$/.exec(accion);
  const i = m === null ? Number.NaN : Number(m[1]);
  if (!Number.isInteger(i) || i < 0 || i > 11) {
    throw new Error(`Acción de azar inválida (se esperaba B0…B11): ${accion}`);
  }
  return i;
}

/**
 * Abstrae un historial externo a letras del juego: primera letra f/x/c/r/a
 * (p. ej. "call"→c, "raise2x"→r, "allin"→a). Lanza con tokens postflop
 * (contienen "/": el juego es solo preflop) o con tokens desconocidos.
 */
export function abstractHistory(tokens: string[]): string {
  let sal = "";
  for (const t of tokens) {
    if (t.includes("/")) {
      throw new Error(`abstractHistory: calles postflop ("/") en "${t}": el juego es preflop`);
    }
    const c = t[0];
    if (c === "f" || c === "x" || c === "c" || c === "r" || c === "a") sal += c;
    else throw new Error(`abstractHistory: token desconocido "${t}"`);
  }
  return sal;
}

class HoldemHuState implements CFRState {
  private constructor(
    private readonly ev: number[][],
    private readonly tie: number[][],
    private readonly cfg: HuConfig,
    private readonly b0: number | null,
    private readonly b1: number | null,
    private readonly actor: CFRPlayer,
    private readonly ap0: number,
    private readonly ap1: number,
    private readonly st0: number,
    private readonly st1: number,
    private readonly subidas: number, // nº de "r" acumulados
    private readonly incr: number, // último incremento (min-raise)
    private readonly hist: readonly string[],
    private readonly act0: boolean,
    private readonly act1: boolean,
    private readonly showdown: boolean, // ronda cerrada sin folds: falta el azar
    private readonly ganadorFold: CFRPlayer | null,
    private readonly resultado: Showdown | null,
  ) {}

  static inicial(ev: number[][], tie: number[][], cfg: HuConfig): HoldemHuState {
    if (!(cfg.sb > 0 && cfg.bb > cfg.sb && cfg.stack > cfg.bb)) {
      throw new Error(`Configuración inválida: sb=${cfg.sb} bb=${cfg.bb} stack=${cfg.stack}`);
    }
    const boton = cfg.button;
    return new HoldemHuState(
      ev,
      tie,
      cfg,
      null,
      null,
      boton,
      cfg.sb,
      cfg.bb,
      cfg.stack - cfg.sb,
      cfg.stack - cfg.bb,
      0,
      cfg.bb,
      [],
      false,
      false,
      false,
      null,
      null,
    );
  }

  get isTerminal(): boolean {
    return this.ganadorFold !== null || this.resultado !== null;
  }

  get turn(): CFRPlayer | typeof CHANCE {
    if (this.necesitaAzar()) return CHANCE;
    if (this.isTerminal) return 0; // convención (comprobar isTerminal primero)
    return this.actor;
  }

  /** Falta reparto de buckets o el azar de showdown. */
  private necesitaAzar(): boolean {
    return this.b0 === null || this.b1 === null || (this.showdown && this.resultado === null);
  }

  private apuestaMax(): number {
    return Math.max(this.ap0, this.ap1);
  }

  private resto(j: CFRPlayer): number {
    return j === 0 ? this.st0 : this.st1;
  }

  private actuado(j: CFRPlayer): boolean {
    return j === 0 ? this.act0 : this.act1;
  }

  legalActions(): string[] {
    if (this.isTerminal || this.necesitaAzar()) return [];
    const yo = this.actor;
    const rival = rivalDe(yo);
    const resto = this.resto(yo);
    if (resto <= 0) return []; // all-in: sin turno pendiente (defensivo)
    const deuda = this.apuestaMax() - (yo === 0 ? this.ap0 : this.ap1);
    const acts = ["f"]; // fold siempre legal
    if (this.resto(rival) <= 0) {
      // Rival all-in: solo igualar o pasar (apostar más no tiene sentido).
      acts.push(deuda > 0 ? "c" : "x");
      return acts;
    }
    acts.push(deuda > 0 ? "c" : "x");
    // Min-raise estándar: to = apuestaMax + max(bb, último incremento).
    const minIncr = Math.max(this.cfg.bb, this.incr);
    const al = yo === 0 ? this.ap0 : this.ap1;
    if (this.subidas < this.cfg.maxRaises && resto > deuda && al + resto >= this.apuestaMax() + minIncr) {
      acts.push("r");
    }
    acts.push("a"); // all-in siempre con fichas (sin tope de raises)
    return acts;
  }

  infosetKey(player: CFRPlayer): string {
    const bucket = player === 0 ? this.b0 : this.b1;
    const pos = player === this.cfg.button ? "SB" : "BB";
    return `HU:B${bucket ?? "?"}:P${player}:${pos}:${this.hist.join("")}`;
  }

  chanceOutcomes(): Array<{ action: string; prob: number }> {
    if (this.isTerminal) return [];
    if (this.b0 === null || this.b1 === null) {
      return BUCKETS.map((b) => ({ action: b.id, prob: b.prob }));
    }
    if (this.showdown && this.resultado === null) {
      const { w, t, l } = this.probShowdown();
      return [
        { action: "ganaA", prob: w },
        { action: "empate", prob: t },
        { action: "ganaB", prob: l },
      ];
    }
    return [];
  }

  /** (w, t, l) del showdown desde EV (= w + t/2) y tie. */
  private probShowdown(): { w: number; t: number; l: number } {
    const a = this.b0 as number;
    const b = this.b1 as number;
    const t = this.tie[a][b];
    const e = this.ev[a][b];
    const w = Math.max(0, e - t / 2);
    const l = Math.max(0, 1 - e - t / 2);
    const s = w + t + l;
    return { w: w / s, t: t / s, l: l / s };
  }

  apply(action: string): CFRState {
    // Azar: reparto de buckets (marginales; P1 igual que P0).
    if (this.b0 === null) return this.clonar({ b0: indiceBucket(action) });
    if (this.b1 === null) return this.clonar({ b1: indiceBucket(action) });
    // Azar: showdown.
    if (this.showdown && this.resultado === null) {
      if (action !== "ganaA" && action !== "empate" && action !== "ganaB") {
        throw new Error(`Acción de azar inválida en showdown: ${action}`);
      }
      return this.clonar({ resultado: action });
    }
    // Apuestas.
    if (this.isTerminal) throw new Error("Estado terminal: no se puede aplicar");
    if (!this.legalActions().includes(action)) {
      throw new Error(`Acción ilegal: ${action} (legales: ${this.legalActions().join(",")})`);
    }
    const yo = this.actor;
    const rival = rivalDe(yo);
    const ap = yo === 0 ? this.ap0 : this.ap1;
    const resto = this.resto(yo);
    const cb = this.apuestaMax();
    const deuda = cb - ap;
    const nhist = [...this.hist, action];
    switch (action) {
      case "f":
        return this.clonar({ ganadorFold: rival, hist: nhist });
      case "x": {
        // Sin deuda: si ambos ya actuaron, la ronda se cierra.
        const nact0 = this.act0 || yo === 0;
        const nact1 = this.act1 || yo === 1;
        if (nact0 && nact1) {
          return this.clonar({ act0: nact0, act1: nact1, showdown: true, hist: nhist });
        }
        return this.clonar({ act0: nact0, act1: nact1, actor: rival, hist: nhist });
      }
      case "c": {
        // Igualar cierra si el rival ya actuó (su apuesta está respondida)
        // o si alguien queda all-in (ya no hay a quién apostar).
        const pago = Math.min(deuda, resto);
        const n = this.paga(yo, pago);
        const nact0 = n.act0 || yo === 0;
        const nact1 = n.act1 || yo === 1;
        const rivalActuo = rival === 0 ? nact0 : nact1;
        const nResto = yo === 0 ? n.st0 : n.st1;
        const rResto = rival === 0 ? n.st0 : n.st1;
        if (nResto === 0 || rResto === 0 || rivalActuo) {
          return n.clonar({ act0: nact0, act1: nact1, showdown: true, hist: nhist });
        }
        return n.clonar({ act0: nact0, act1: nact1, actor: rival, hist: nhist });
      }
      case "r": {
        const to = cb + Math.max(this.cfg.bb, this.incr);
        const n = this.paga(yo, to - ap);
        const nact0 = n.act0 || yo === 0;
        const nact1 = n.act1 || yo === 1;
        return n.clonar({
          act0: nact0,
          act1: nact1,
          actor: rival,
          subidas: this.subidas + 1,
          hist: nhist,
        });
      }
      default: {
        // "a": all-in. Si supera la apuesta es agresivo (pasa el turno);
        // si solo iguala, cierra igual que "c". Con stacks iguales el
        // all-in siempre cubre (nunca queda apuesta corta sin igualar).
        const n = this.paga(yo, resto);
        const nact0 = n.act0 || yo === 0;
        const nact1 = n.act1 || yo === 1;
        const nap = yo === 0 ? n.ap0 : n.ap1;
        if (nap > cb) {
          const rResto = rival === 0 ? n.st0 : n.st1;
          const subida = nap - cb;
          const n2 = n.clonar({
            act0: nact0,
            act1: nact1,
            incr: Math.max(n.incr, subida),
            hist: nhist,
          });
          if (rResto === 0) return n2.clonar({ showdown: true });
          return n2.clonar({ actor: rival });
        }
        const rivalActuo = rival === 0 ? nact0 : nact1;
        const rResto = rival === 0 ? n.st0 : n.st1;
        if (rResto === 0 || rivalActuo) {
          return n.clonar({ act0: nact0, act1: nact1, showdown: true, hist: nhist });
        }
        return n.clonar({ act0: nact0, act1: nact1, actor: rival, hist: nhist });
      }
    }
  }

  /** Nuevo estado moviendo `pago` fichas del resto al aportado de `j`. */
  private paga(j: CFRPlayer, pago: number): HoldemHuState {
    return this.clonar({
      ap0: j === 0 ? this.ap0 + pago : this.ap0,
      ap1: j === 1 ? this.ap1 + pago : this.ap1,
      st0: j === 0 ? this.st0 - pago : this.st0,
      st1: j === 1 ? this.st1 - pago : this.st1,
    });
  }

  utility(player: CFRPlayer): number {
    if (!this.isTerminal) throw new Error("utility solo en estado terminal");
    const u0 = this.utilidadP0();
    if (u0 === 0) return 0; // normaliza -0 a +0
    return player === 0 ? u0 : -u0;
  }

  /** Utilidad neta de P0: lo ganado menos lo aportado (rival aporta = gana). */
  private utilidadP0(): number {
    if (this.ganadorFold !== null) {
      // Fold: el bote (lo aportado por ambos) se lo lleva el otro.
      return this.ganadorFold === 0 ? this.ap1 : -this.ap0;
    }
    const r = this.resultado as Showdown;
    if (r === "ganaA") return this.ap1;
    if (r === "ganaB") return -this.ap0;
    return (this.ap1 - this.ap0) / 2; // empate: split
  }

  private clonar(o: {
    b0?: number | null;
    b1?: number | null;
    actor?: CFRPlayer;
    ap0?: number;
    ap1?: number;
    st0?: number;
    st1?: number;
    subidas?: number;
    incr?: number;
    hist?: readonly string[];
    act0?: boolean;
    act1?: boolean;
    showdown?: boolean;
    ganadorFold?: CFRPlayer | null;
    resultado?: Showdown | null;
  }): HoldemHuState {
    return new HoldemHuState(
      this.ev,
      this.tie,
      this.cfg,
      o.b0 !== undefined ? o.b0 : this.b0,
      o.b1 !== undefined ? o.b1 : this.b1,
      o.actor !== undefined ? o.actor : this.actor,
      o.ap0 !== undefined ? o.ap0 : this.ap0,
      o.ap1 !== undefined ? o.ap1 : this.ap1,
      o.st0 !== undefined ? o.st0 : this.st0,
      o.st1 !== undefined ? o.st1 : this.st1,
      o.subidas !== undefined ? o.subidas : this.subidas,
      o.incr !== undefined ? o.incr : this.incr,
      o.hist !== undefined ? o.hist : this.hist,
      o.act0 !== undefined ? o.act0 : this.act0,
      o.act1 !== undefined ? o.act1 : this.act1,
      o.showdown !== undefined ? o.showdown : this.showdown,
      o.ganadorFold !== undefined ? o.ganadorFold : this.ganadorFold,
      o.resultado !== undefined ? o.resultado : this.resultado,
    );
  }
}

function validaTabla(t: unknown, nombre: string): void {
  const ok =
    Array.isArray(t) &&
    t.length === 12 &&
    t.every(
      (f) =>
        Array.isArray(f) &&
        f.length === 12 &&
        (f as unknown[]).every((v) => typeof v === "number"),
    );
  if (!ok) throw new Error(`holdemHuGame: tabla ${nombre} inválida (se espera 12×12)`);
}

export class HoldemHuGame implements CFRGame {
  readonly name = "holdem-hu-preflop";
  private readonly ev: number[][];
  private readonly tie: number[][];
  private readonly cfg: HuConfig;

  constructor(ev: number[][], tie: number[][], cfg: HuConfig) {
    validaTabla(ev, "ev");
    validaTabla(tie, "tie");
    this.ev = ev;
    this.tie = tie;
    this.cfg = cfg;
  }

  newInitial(): CFRState {
    return HoldemHuState.inicial(this.ev, this.tie, this.cfg);
  }
}

/**
 * Construye el juego. `tie` (matriz de empates) es opcional: puede pasarse
 * como segundo argumento, o la configuración directamente
 * `holdemHuGame(ev, cfg)`; sin tie se supone t=0 (w=EV, l=1−EV).
 */
export function holdemHuGame(
  ev: number[][],
  tieOrCfg?: number[][] | HoldemHuConfig,
  maybeCfg?: HoldemHuConfig,
): CFRGame {
  let tie: number[][] | null = null;
  let cfg: Partial<HoldemHuConfig> = {};
  if (Array.isArray(tieOrCfg)) {
    tie = tieOrCfg;
    if (maybeCfg) cfg = maybeCfg;
  } else if (tieOrCfg) {
    cfg = tieOrCfg;
  }
  const completa: HuConfig = {
    sb: cfg.sb ?? DEFAULT_HU.sb,
    bb: cfg.bb ?? DEFAULT_HU.bb,
    stack: cfg.stack ?? DEFAULT_HU.stack,
    maxRaises: cfg.maxRaises ?? DEFAULT_HU.maxRaises,
    button: cfg.button ?? DEFAULT_HU.button ?? 0,
  };
  const ceros: number[][] = Array.from({ length: 12 }, () => new Array<number>(12).fill(0));
  return new HoldemHuGame(ev, tie ?? ceros, completa);
}
