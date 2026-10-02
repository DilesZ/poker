// Tests de buckets preflop (vitest, cero deps salvo vitest).
import { describe, expect, it } from "vitest";
import type { Card, Rank, Suit } from "../poker/types";
import { BUCKETS, TOTAL_COMBOS, bucketOf } from "./buckets";

function carta(rank: Rank, suit: Suit): Card {
  return { rank, suit };
}

function mazo52(): Card[] {
  const palos: Suit[] = ["♠", "♥", "♦", "♣"];
  const rangos: Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
  const mazo: Card[] = [];
  for (const suit of palos) for (const rank of rangos) mazo.push({ rank, suit });
  return mazo;
}

describe("buckets", () => {
  it("bucketOf es canónico: AsKs cae en el bucket de AK en ambos órdenes", () => {
    const aks = bucketOf(carta(14, "♠"), carta(13, "♠"));
    expect(aks).toBe("B4"); // AK suited+offsuit
    expect(bucketOf(carta(13, "♠"), carta(14, "♠"))).toBe(aks);
    // Offsuit también es B4, pero suited/off se distinguen entre sí.
    expect(bucketOf(carta(14, "♠"), carta(13, "♥"))).toBe("B4");
    // Pares: orden irrelevante.
    expect(bucketOf(carta(14, "♠"), carta(14, "♥"))).toBe("B0");
    expect(bucketOf(carta(14, "♥"), carta(14, "♠"))).toBe("B0");
  });

  it("la misma carta exacta dos veces lanza", () => {
    const as = carta(14, "♠");
    expect(() => bucketOf(as, { rank: 14, suit: "♠" })).toThrow();
  });

  it("toda pareja de cartas cae en algún bucket y los combos suman 1326", () => {
    const mazo = mazo52();
    let pares = 0;
    for (let i = 0; i < mazo.length; i++) {
      for (let j = i + 1; j < mazo.length; j++) {
        const b = bucketOf(mazo[i], mazo[j]);
        expect(b).toMatch(/^B([0-9]|1[01])$/);
        pares++;
      }
    }
    expect(pares).toBe((52 * 51) / 2);
    expect(TOTAL_COMBOS).toBe(1326);
    expect(BUCKETS).toHaveLength(12);
    expect(BUCKETS.reduce((s, b) => s + b.combos, 0)).toBe(1326);
  });
});
