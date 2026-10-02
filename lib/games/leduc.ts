// Leduc Hold'em sobre la interfaz CFR mínima (TypeScript puro, cero deps).
// Reglas implementadas (variante tabular con acciones pass/bet):
// - Mazo [J, J, Q, Q, K, K] (dos palos; solo importa el rango, J < Q < K).
// - Ante 1 por jugador (bote inicial 2).
// - Ronda 1: carta privada a cada uno (azar sin reemplazo) + apuestas de 2.
// - Ronda 2: carta pública (de las restantes) + apuestas de 4.
// - Acciones: "pass" (pasar sin deuda / retirarse con deuda) y "bet"
//   (apostar o igualar; siempre suma el tamaño de la ronda).
// - Máximo 2 apuestas agresivas (aperturas o subidas tras igualar) por
//   ronda; igualar (bet con deuda) siempre es legal. Dos passes seguidos
//   sin deuda cierran la ronda (reparte la pública o llega al showdown).
// - Showdown: pareja con la pública gana a todo; si no, carta privada más
//   alta; empate exacto → reparto (split).
// - Bote y aportado[2] internos; utilidades en fichas netas desde P0
//   (zero-sum: u1 = −u0). Estados inmutables: apply() no muta.
import { CHANCE, type CFRGame, type CFRPlayer, type CFRState } from "../cfr/game";

export type LeducCard = "J" | "Q" | "K";

const RANGOS: LeducCard[] = ["J", "Q", "K"];
const FUERZA: Record<LeducCard, number> = { J: 0, Q: 1, K: 2 };
const COPIAS_POR_RANGO = 2; // dos palos
const TAMANO: [number, number] = [2, 4]; // apuesta agresiva por ronda
const MAX_AGRESIVAS = 2; // tope de subidas por ronda (la 3.ª es ilegal)

function esCarta(valor: string): valor is LeducCard {
  return valor === "J" || valor === "Q" || valor === "K";
}

function rivalDe(jugador: CFRPlayer): CFRPlayer {
  return ((1 - jugador) as CFRPlayer);
}

class LeducState implements CFRState {
  private constructor(
    private readonly priv0: LeducCard | null,
    private readonly priv1: LeducCard | null,
    private readonly pub: LeducCard | null,
    private readonly ronda: 0 | 1,
    private readonly turno: CFRPlayer,
    private readonly aportado0: number,
    private readonly aportado1: number,
    private readonly bote: number,
    private readonly agresivas: number, // apuestas agresivas en la ronda actual
    private readonly hist0: readonly string[], // apuestas de la ronda 1
    private readonly hist1: readonly string[], // apuestas de la ronda 2
    private readonly pases: number, // passes consecutivos sin deuda
    private readonly foldGanador: CFRPlayer | null,
    private readonly showdown: boolean,
  ) {}

  static inicial(): LeducState {
    return new LeducState(null, null, null, 0, 0, 1, 1, 2, 0, [], [], 0, null, false);
  }

  get isTerminal(): boolean {
    return this.foldGanador !== null || this.showdown;
  }

  get turn(): CFRPlayer | typeof CHANCE {
    if (this.necesitaAzar()) return CHANCE;
    // En terminales no hay turno real; se devuelve 0 por convención
    // (comprobar isTerminal primero).
    if (this.isTerminal) return 0;
    return this.turno;
  }

  /** Queda reparto pendiente: privadas o pública (ronda 2 sin pub). */
  private necesitaAzar(): boolean {
    return this.priv0 === null || this.priv1 === null || (this.ronda === 1 && this.pub === null);
  }

  /** Deuda del jugador en turno (siempre 0 o el tamaño de la ronda). */
  private deuda(): number {
    const propio = this.turno === 0 ? this.aportado0 : this.aportado1;
    const contrario = this.turno === 0 ? this.aportado1 : this.aportado0;
    return contrario - propio;
  }

  legalActions(): string[] {
    if (this.isTerminal) return [];
    if (this.necesitaAzar()) return []; // el azar usa chanceOutcomes()
    if (this.deuda() > 0) return ["pass", "bet"]; // retirarse o igualar
    if (this.agresivas < MAX_AGRESIVAS) return ["pass", "bet"]; // pasar o apostar
    return ["pass"]; // tope de subidas alcanzado: solo pasar
  }

  infosetKey(player: CFRPlayer): string {
    const propia = player === 0 ? this.priv0 : this.priv1;
    const publica = this.pub ?? "-";
      const h0 = this.hist0.join(",");
      const historia = this.pub === null ? h0 : `${h0}/${this.hist1.join(",")}`;
      // El jugador forma parte de la key (ver Kuhn: evita colisión P0/P1).
      return `Leduc:${player}:${propia ?? "?"}|${publica}|${historia}`;
  }

  chanceOutcomes(): Array<{ action: string; prob: number }> {
    if (this.isTerminal) return [];
    if (this.priv0 === null) return RANGOS.map((c) => ({ action: c, prob: 1 / 3 }));
    if (this.priv1 === null) return this.restantes([this.priv0]);
    if (this.ronda === 1 && this.pub === null) return this.restantes([this.priv0, this.priv1]);
    return [];
  }

  /** Rangos aún en el mazo con su probabilidad (sin reemplazo). */
  private restantes(repartidas: LeducCard[]): Array<{ action: string; prob: number }> {
    const cuenta: Record<LeducCard, number> = { J: COPIAS_POR_RANGO, Q: COPIAS_POR_RANGO, K: COPIAS_POR_RANGO };
    for (const c of repartidas) cuenta[c] -= 1;
    const total = RANGOS.reduce((acum, c) => acum + cuenta[c], 0);
    return RANGOS.filter((c) => cuenta[c] > 0).map((c) => ({ action: c, prob: cuenta[c] / total }));
  }

  apply(action: string): CFRState {
    // Fase de reparto (turno del azar).
    if (this.necesitaAzar()) {
      if (!esCarta(action)) throw new Error(`Acción de azar inválida: ${action}`);
      this.validarDisponible(action);
      if (this.priv0 === null) return this.clonar({ priv0: action });
      if (this.priv1 === null) return this.clonar({ priv1: action });
      return this.clonar({ pub: action });
    }
    // Fase de apuestas.
    if (this.isTerminal) throw new Error("Estado terminal: no se puede aplicar");
    if (action !== "pass" && action !== "bet") throw new Error(`Acción inválida: ${action}`);
    if (!this.legalActions().includes(action)) {
      throw new Error(`Acción ilegal: ${action} (deuda ${this.deuda()}, agresivas ${this.agresivas})`);
    }
    const deuda = this.deuda();
    const rival = rivalDe(this.turno);
    const hist0 = this.ronda === 0 ? [...this.hist0, action] : this.hist0;
    const hist1 = this.ronda === 1 ? [...this.hist1, action] : this.hist1;
    if (action === "pass") {
      if (deuda > 0) {
        // Retirada ante apuesta: el rival se lleva el bote.
        return this.clonar({ hist0, hist1, foldGanador: rival });
      }
      const pases = this.pases + 1;
      if (pases >= 2) return this.cerrarRonda(hist0, hist1);
      return this.clonar({ hist0, hist1, pases, turno: rival });
    }
    // "bet": suma el tamaño de la ronda (apuesta agresiva sin deuda,
    // igualada exacta con deuda; la deuda siempre es justo el tamaño).
    const tamano = TAMANO[this.ronda];
    const esAgresiva = deuda === 0;
    return this.clonar({
      hist0,
      hist1,
      aportado0: this.turno === 0 ? this.aportado0 + tamano : this.aportado0,
      aportado1: this.turno === 1 ? this.aportado1 + tamano : this.aportado1,
      bote: this.bote + tamano,
      agresivas: this.agresivas + (esAgresiva ? 1 : 0),
      pases: 0,
      turno: rival,
    });
  }

  /** Dos passes sin deuda cierran la ronda: pública (azar) o showdown. */
  private cerrarRonda(hist0: readonly string[], hist1: readonly string[]): LeducState {
    if (this.ronda === 0) {
      // A la ronda 2 con la pública pendiente (pub null + ronda 1 = azar).
      return this.clonar({ hist0, hist1, ronda: 1, turno: 0, agresivas: 0, pases: 0 });
    }
    return this.clonar({ hist0, hist1, showdown: true });
  }

  /** Rechaza repartir un rango ya agotado (sin reemplazo, 2 copias). */
  private validarDisponible(carta: LeducCard): void {
    const repartidas = [this.priv0, this.priv1, this.pub].filter(
      (c): c is LeducCard => c !== null,
    );
    const usadas = repartidas.filter((c) => c === carta).length;
    if (usadas >= COPIAS_POR_RANGO) throw new Error(`Carta ya agotada: ${carta}`);
  }

    utility(player: CFRPlayer): number {
      if (!this.isTerminal) throw new Error("utility solo en estado terminal");
      const u0 = this.utilidadP0();
      // Normaliza -0 a +0 (Object.is los distingue y rompe splits a cero).
      if (u0 === 0) return 0;
      return player === 0 ? u0 : -u0;
    }

  /** Utilidad neta de P0: lo ganado menos lo aportado (rival aporta = gana). */
  private utilidadP0(): number {
    if (this.foldGanador !== null) {
      return this.foldGanador === 0 ? this.aportado1 : -this.aportado0;
    }
    const c0 = this.priv0 as LeducCard;
    const c1 = this.priv1 as LeducCard;
    const b = this.pub as LeducCard;
    const par0 = c0 === b;
    const par1 = c1 === b;
    if (par0 && !par1) return this.aportado1; // pareja con la pública gana a todo
    if (par1 && !par0) return -this.aportado0;
    if (!par0 && !par1) {
      if (FUERZA[c0] > FUERZA[c1]) return this.aportado1; // carta privada más alta
      if (FUERZA[c1] > FUERZA[c0]) return -this.aportado0;
    }
    // Empate exacto (incluida doble pareja del mismo rango): split.
    return (this.aportado1 - this.aportado0) / 2;
  }

  private clonar(o: {
    priv0?: LeducCard | null;
    priv1?: LeducCard | null;
    pub?: LeducCard | null;
    ronda?: 0 | 1;
    turno?: CFRPlayer;
    aportado0?: number;
    aportado1?: number;
    bote?: number;
    agresivas?: number;
    hist0?: readonly string[];
    hist1?: readonly string[];
    pases?: number;
    foldGanador?: CFRPlayer | null;
    showdown?: boolean;
  }): LeducState {
    return new LeducState(
      o.priv0 !== undefined ? o.priv0 : this.priv0,
      o.priv1 !== undefined ? o.priv1 : this.priv1,
      o.pub !== undefined ? o.pub : this.pub,
      o.ronda !== undefined ? o.ronda : this.ronda,
      o.turno !== undefined ? o.turno : this.turno,
      o.aportado0 !== undefined ? o.aportado0 : this.aportado0,
      o.aportado1 !== undefined ? o.aportado1 : this.aportado1,
      o.bote !== undefined ? o.bote : this.bote,
      o.agresivas !== undefined ? o.agresivas : this.agresivas,
      o.hist0 !== undefined ? o.hist0 : this.hist0,
      o.hist1 !== undefined ? o.hist1 : this.hist1,
      o.pases !== undefined ? o.pases : this.pases,
      o.foldGanador !== undefined ? o.foldGanador : this.foldGanador,
      o.showdown !== undefined ? o.showdown : this.showdown,
    );
  }
}

export class LeducGame implements CFRGame {
  readonly name = "leduc";
  newInitial(): CFRState {
    return LeducState.inicial();
  }
}

/** Instancia compartida del juego (los estados son inmutables). */
export const leducGame: CFRGame = new LeducGame();
