// Tests del estado inicial del motor (ciegas y reparto).
import { describe, expect, it } from "vitest";
import { newEngineHand, postBlindsAndDeal } from "./state";

describe("engine/state", () => {
  // 1. Mesa 6-max con stacks iniciales.
  it("crea 6 jugadores con 1000 fichas", () => {
    const s = newEngineHand({
      numPlayers: 6,
      startingStack: 1000,
      sb: 10,
      bb: 20,
      button: 0,
      handId: "h1",
      seed: 1,
    });
    expect(s.players).toHaveLength(6);
    for (const p of s.players) {
      expect(p.stack).toBe(1000);
      expect(p.hole).toHaveLength(0);
    }
    expect(s.street).toBe("preflop");
    expect(s.pot).toBe(0);
    expect(s.actingSeat).toBeNull();
  });

  // 2. HU: la SB esta en el button y actua primero preflop.
  it("HU: SB en button y actua primero", () => {
    const s0 = newEngineHand({
      numPlayers: 2,
      startingStack: 1000,
      sb: 10,
      bb: 20,
      button: 1,
      handId: "hu",
      seed: 7,
    });
    const s = postBlindsAndDeal(s0);
    // SB = button en HU.
    const sb = s.players.find((p) => p.seat === 1)!;
    const bb = s.players.find((p) => p.seat === 0)!;
    expect(sb.betStreet).toBe(10);
    expect(bb.betStreet).toBe(20);
    expect(s.actingSeat).toBe(1);
  });

  // 3. 6-max: actua primero UTG (button+3).
  it("6-max: UTG (button+3) actua primero", () => {
    const s0 = newEngineHand({
      numPlayers: 6,
      startingStack: 1000,
      sb: 10,
      bb: 20,
      button: 0,
      handId: "six",
      seed: 7,
    });
    const s = postBlindsAndDeal(s0);
    expect(s.actingSeat).toBe(3);
  });

  // 4. El mazo restante es 52 menos 2 cartas por jugador.
  it("deck queda 52-2n tras repartir", () => {
    const s0 = newEngineHand({
      numPlayers: 6,
      startingStack: 1000,
      sb: 10,
      bb: 20,
      button: 0,
      handId: "deck",
      seed: 42,
    });
    const s = postBlindsAndDeal(s0);
    expect(s.deck).toHaveLength(52 - 2 * 6);
    for (const p of s.players) expect(p.hole).toHaveLength(2);
  });

  // 5. Determinismo: mismo seed produce mismas cartas.
  it("mismo seed produce mismas holes", () => {
    const mk = () =>
      postBlindsAndDeal(
        newEngineHand({
          numPlayers: 6,
          startingStack: 1000,
          sb: 10,
          bb: 20,
          button: 0,
          handId: "det",
          seed: 1234,
        }),
      );
    const a = mk();
    const b = mk();
    expect(a.players.map((p) => p.hole)).toEqual(b.players.map((p) => p.hole));
  });

  // 6. Semilla distinta cambia el reparto.
  it("distinto seed produce distinto reparto", () => {
    const mk = (seed: number) =>
      postBlindsAndDeal(
        newEngineHand({
          numPlayers: 6,
          startingStack: 1000,
          sb: 10,
          bb: 20,
          button: 0,
          handId: "det2",
          seed,
        }),
      );
    const a = mk(11);
    const b = mk(22);
    expect(JSON.stringify(a.players.map((p) => p.hole))).not.toBe(
      JSON.stringify(b.players.map((p) => p.hole)),
    );
  });

  // 7. Stack menor que la ciega deja al jugador all-in.
  it("all-in en ciega si stack < sb", () => {
    const s0 = newEngineHand({
      numPlayers: 2,
      startingStack: 5,
      sb: 10,
      bb: 20,
      button: 0,
      handId: "short",
      seed: 99,
    });
    const s = postBlindsAndDeal(s0);
    const sb = s.players.find((p) => p.seat === 0)!;
    expect(sb.stack).toBe(0);
    expect(sb.allIn).toBe(true);
    expect(sb.betStreet).toBe(5);
  });
});
