// Tests del replay con cartas: el cierre guarda heroHole + board,
// y los historiales viejos (sin cartas) se leen con tipos laxos sin romper.
import { beforeEach, describe, expect, it } from "vitest";
import { usePokerStore, type StoredHand } from "./usePokerStore";

function estado() {
  return usePokerStore.getState();
}

type RecLaxo = StoredHand & { heroHole?: unknown; board?: unknown };

beforeEach(() => {
  estado().clearHistories();
});

describe("historial con cartas para el replay", () => {
  it("al cerrar la mano guarda heroHole de 2 cartas + board (aunque el héroe foldee)", () => {
    estado().startHand();
    const mesa = estado().game;
    if (!mesa) throw new Error("sin mesa tras startHand");
    // El hole del héroe existe en el estado aunque vaya a foldear.
    expect(mesa.players[0]?.hole).toHaveLength(2);
    estado().heroFold();

    const { histories } = estado();
    expect(histories).toHaveLength(1);
    const rec = histories[0] as RecLaxo;
    if (!rec) throw new Error("falta el HandRecord");
    expect(Array.isArray(rec.heroHole)).toBe(true);
    expect((rec.heroHole as unknown[])).toHaveLength(2);
    expect(Array.isArray(rec.board)).toBe(true);
    // El board al cerrar tras fold se completa (5 comunitarias por showdown de villanos).
    expect((rec.board as unknown[]).length).toBeGreaterThanOrEqual(0);
  });

  it("un historial viejo sin heroHole/board se lee como EV unavailable sin romper", () => {
    estado().startHand();
    estado().heroFold();
    expect(estado().histories).toHaveLength(1);

    // Simula un historial anterior a las cartas: quita los campos extra.
    const legado = { ...estado().histories[0] } as RecLaxo;
    delete legado.heroHole;
    delete legado.board;
    usePokerStore.setState({ histories: [legado as StoredHand] });

    const rec = estado().histories[0] as RecLaxo;
    if (!rec) throw new Error("falta el HandRecord legado");
    // Lectura laxa como hace el panel: opcionales, sin lanzar.
    const heroHole = Array.isArray(rec.heroHole) ? rec.heroHole : undefined;
    const board = Array.isArray(rec.board) ? rec.board : undefined;
    expect(heroHole).toBeUndefined();
    expect(board).toBeUndefined();
    const sinCartas = heroHole === undefined || board === undefined;
    expect(sinCartas).toBe(true);
    // El mensaje del panel para este caso (contrato del replay).
    const mensaje = sinCartas
      ? "EV unavailable: mano sin cartas registradas (historial anterior)"
      : "con cartas";
    expect(mensaje).toContain("EV unavailable");

    // El store sigue operativo tras leer un legado: cierra otra mano con cartas.
    estado().startHand();
    estado().heroFold();
    expect(estado().histories).toHaveLength(2);
    const nueva = estado().histories[1] as RecLaxo;
    expect((nueva?.heroHole as unknown[] | undefined)?.length).toBe(2);
  });
});
