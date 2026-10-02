// Tests del historial de manos del héroe: cierre sintético, cap 200 y limpieza.
import { beforeEach, describe, expect, it } from "vitest";
import { usePokerStore } from "./usePokerStore";

function estado() {
  return usePokerStore.getState();
}

beforeEach(() => {
  estado().clearHistories();
});

describe("historial del héroe", () => {
  it("cierra 1 mano con fold y guarda 1 HandRecord con heroSeat/positions/result", () => {
    const s0 = estado();
    s0.startHand();
    estado().heroFold();

    const { histories, button } = estado();
    expect(histories).toHaveLength(1);
    const rec = histories[0];
    if (!rec) throw new Error("falta el HandRecord");
    expect(rec.heroSeat).toBe(0);
    expect(rec.button).toBe(button);
    expect(rec.id).toMatch(/^h-\d+-\d+$/);
    expect(typeof rec.ts).toBe("number");
    // Positions 6-max desde el botón: +1 SB, +2 BB, +3 UTG, +4 MP, +5 CO, +0 BTN.
    expect(rec.positions[(button + 1) % 6]).toBe("SB");
    expect(rec.positions[(button + 2) % 6]).toBe("BB");
    expect(rec.positions[(button + 3) % 6]).toBe("UTG");
    expect(rec.positions[(button + 4) % 6]).toBe("MP");
    expect(rec.positions[(button + 5) % 6]).toBe("CO");
    expect(rec.positions[button]).toBe("BTN");
    // El héroe foldeó preflop: 1 acción y sin showdown.
    expect(rec.actions).toHaveLength(1);
    expect(rec.actions[0]?.action).toBe("fold");
    expect(rec.actions[0]?.seat).toBe(0);
    expect(rec.result.showdown).toBe(false);
    expect(Number.isFinite(rec.result.bbWon)).toBe(true);
  });

  it("juega con call + calles hasta el cierre y registra posiciones y resultado", () => {
    estado().startHand();
    estado().heroCallOrCheck();
    // Avanza calles hasta que la mano se cierre (showdown o bote uncontested).
    for (let i = 0; i < 6; i++) {
      if (estado().game?.street === "done") break;
      estado().nextStreet();
    }
    expect(estado().game?.street).toBe("done");
    const { histories } = estado();
    expect(histories).toHaveLength(1);
    const rec = histories[0];
    if (!rec) throw new Error("falta el HandRecord");
    expect(rec.heroSeat).toBe(0);
    expect(Object.keys(rec.positions)).toHaveLength(6);
    expect(rec.actions.length).toBeGreaterThanOrEqual(1);
    expect(typeof rec.result.showdown).toBe("boolean");
    expect(Number.isFinite(rec.result.bbWon)).toBe(true);
  });

  it("aplica el cap 200 al insertar 205 manos vía recordHand", () => {
    for (let i = 0; i < 205; i++) {
      estado().startHand();
      estado().recordHand(false);
    }
    const { histories } = estado();
    expect(histories).toHaveLength(200);
    const ids = histories.map((h) => h.id);
    expect(new Set(ids).size).toBe(200);
  });

  it("clearHistories vacía el historial", () => {
    estado().startHand();
    estado().heroFold();
    expect(estado().histories).toHaveLength(1);
    estado().clearHistories();
    expect(estado().histories).toHaveLength(0);
  });
});
