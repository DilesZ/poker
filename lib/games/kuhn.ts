// Kuhn póker sobre la interfaz CFR mínima (TypeScript puro, cero deps).
// Reglas: ante 1 por jugador (bote 2), mazo [J, Q, K] con K > Q > J.
// El azar reparte en secuencia sin reemplazo: primero a P0 (3 opciones a
// 1/3) y luego a P1 (2 restantes a 1/2). Apuestas: pass/bet; ante bet solo
// fold/call; ante pass+pass hay showdown. Bote final: 2 sin apuesta, 3 con
// apuesta sin igualar (fold) o 4 con apuesta igualada; el ganador se lleva
// el bote y las utilidades son fichas netas desde P0 (bote ganado − aportado):
// showdown sin apuesta ±1, fold ±1 a favor del apostador, showdown con
// apuesta igualada ±2 (pagos estándar; valor del juego ≈ −1/18 para P0).
// Historia pública con códigos de una letra: p = pass, b = bet, f = fold,
// c = call (p. ej. "pb" = P0 pasa, P1 apuesta; "pp" = doble pass).
import { CHANCE, type CFRGame, type CFRPlayer, type CFRState } from "../cfr/game";

export type KuhnCard = "J" | "Q" | "K";

const MAZO: KuhnCard[] = ["J", "Q", "K"];
const FUERZA: Record<KuhnCard, number> = { J: 0, Q: 1, K: 2 };
const CODIGO: Record<string, string> = { pass: "p", bet: "b", fold: "f", call: "c" };
const TERMINALES = new Set(["pp", "bf", "bc", "pbf", "pbc"]);

function esCarta(valor: string): valor is KuhnCard {
  return valor === "J" || valor === "Q" || valor === "K";
}

class KuhnState implements CFRState {
  private constructor(
    private readonly carta0: KuhnCard | null,
    private readonly carta1: KuhnCard | null,
    private readonly historia: string,
  ) {}

  static inicial(): KuhnState {
    return new KuhnState(null, null, "");
  }

  get isTerminal(): boolean {
    return TERMINALES.has(this.historia);
  }

  get turn(): CFRPlayer | typeof CHANCE {
    if (this.carta0 === null || this.carta1 === null) return CHANCE;
    // En terminales no hay turno real; se devuelve 0 por convención
    // (comprobar isTerminal primero).
    if (this.isTerminal) return 0;
    if (this.historia === "") return 0;
    if (this.historia === "p" || this.historia === "b") return 1;
    if (this.historia === "pb") return 0;
    return 0;
  }

  legalActions(): string[] {
    if (this.isTerminal) return [];
    if (this.turn === CHANCE) return []; // el azar usa chanceOutcomes()
    if (this.historia === "" || this.historia === "p") return ["pass", "bet"];
    return ["fold", "call"];
  }

  infosetKey(player: CFRPlayer): string {
    // El jugador FORMA PARTE de la key: sin él, P0-con-Q y P1-con-Q
    // colisionarían en el mismo nodo y el CFR no convergería.
    const propia = player === 0 ? this.carta0 : this.carta1;
    return `Kuhn:${player}:${propia ?? "?"}|${this.historia}`;
  }

  chanceOutcomes(): Array<{ action: string; prob: number }> {
    if (this.isTerminal) return [];
    if (this.carta0 === null) return MAZO.map((c) => ({ action: c, prob: 1 / 3 }));
    if (this.carta1 === null) {
      return MAZO.filter((c) => c !== this.carta0).map((c) => ({ action: c, prob: 1 / 2 }));
    }
    return [];
  }

  apply(action: string): CFRState {
    // Fase de reparto (turno del azar).
    if (this.carta0 === null || this.carta1 === null) {
      if (!esCarta(action)) throw new Error(`Acción de azar inválida: ${action}`);
      if (this.carta0 === null) return new KuhnState(action, null, "");
      if (action === this.carta0) throw new Error(`Carta ya repartida: ${action}`);
      return new KuhnState(this.carta0, action, "");
    }
    // Fase de apuestas.
    if (this.isTerminal) throw new Error("Estado terminal: no se puede aplicar");
    if (!(action in CODIGO) || !this.legalActions().includes(action)) {
      throw new Error(`Acción ilegal: ${action} con historia "${this.historia}"`);
    }
    return new KuhnState(this.carta0, this.carta1, this.historia + CODIGO[action]);
  }

  utility(player: CFRPlayer): number {
    if (!this.isTerminal) throw new Error("utility solo en estado terminal");
    const u0 = this.utilidadP0();
    return player === 0 ? u0 : -u0;
  }

  /** Utilidad neta de P0 según la historia terminal (cartas ya fijadas). */
  private utilidadP0(): number {
    const c0 = this.carta0 as KuhnCard;
    const c1 = this.carta1 as KuhnCard;
    switch (this.historia) {
      case "bf":
        return 1; // P0 apuesta y P1 abandona: gana el apostador
      case "pbf":
        return -1; // P1 apuesta y P0 abandona: gana el apostador
      case "pp":
        return this.desempate(c0, c1, 1);
      case "bc":
      case "pbc":
        return this.desempate(c0, c1, 2);
      default:
        throw new Error(`Historia terminal desconocida: ${this.historia}`);
    }
  }

  /** Showdown: carta alta gana `bote` neto (±bote desde P0). Sin empates. */
  private desempate(c0: KuhnCard, c1: KuhnCard, bote: number): number {
    return FUERZA[c0] > FUERZA[c1] ? bote : -bote;
  }
}

export class KuhnGame implements CFRGame {
  readonly name = "kuhn";
  newInitial(): CFRState {
    return KuhnState.inicial();
  }
}

/** Instancia compartida del juego (los estados son inmutables). */
export const kuhnGame: CFRGame = new KuhnGame();
