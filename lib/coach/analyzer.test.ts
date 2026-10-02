// Tests del analizador del coach. En español. Sin dependencias salvo vitest.
import { describe, expect, it } from "vitest";
import { analyzeHistories } from "./analyzer";
import type { Card, Rank, Suit } from "../poker/types";
import type { CoachActionType, CoachStreet, HandAction, HandRecord, PosLabel } from "./types";

function acc(
  street: CoachStreet,
  seat: number,
  action: CoachActionType,
  amount = 0,
  potAfter = 0,
): HandAction {
  return { street, seat, action, amount, potAfter };
}

function mano(
  id: string,
  posHeroe: PosLabel,
  acciones: HandAction[],
  showdown: boolean,
  posRival: PosLabel = "BTN",
): HandRecord {
  return {
    id,
    ts: 1,
    heroSeat: 0,
    button: 1,
    positions: { 0: posHeroe, 1: posRival },
    actions: acciones,
    result: { bbWon: 0, showdown },
  };
}

// Mano EP loose: el héroe iguala preflop fuera de posición.
function manoEpLoose(id: string, pos: PosLabel): HandRecord {
  return mano(id, pos, [acc("preflop", 1, "raise", 60, 80), acc("preflop", 0, "call", 60, 140)], false);
}

function carta(rank: Rank, suit: Suit): Card {
  return { rank, suit };
}

function manoCon(
  id: string,
  posHeroe: PosLabel,
  acciones: HandAction[],
  showdown: boolean,
  heroHole?: Card[],
  board?: Card[],
  bbWon = 0,
): HandRecord {
  return {
    id,
    ts: 1,
    heroSeat: 0,
    button: 1,
    positions: { 0: posHeroe, 1: "BTN" },
    actions: acciones,
    result: { bbWon, showdown },
    heroHole,
    board,
  };
}

const NUEVOS = ["OVERFOLD", "MISSED_VALUE", "BAD_SIZING", "BAD_PREFLOP", "OVERAGGRESSION"];

describe("analyzeHistories", () => {
  it("overall exacto en 4 manos sintéticas", () => {
    const manos: HandRecord[] = [
      // h1: héroe iguala (vpip, sin pfr ni 3bet), sin postflop ni showdown.
      mano("h1", "BTN", [acc("preflop", 1, "bet", 40, 60), acc("preflop", 0, "call", 40, 100)], false),
      // h2: héroe abre (vpip+pfr, sin 3bet), apuesta en flop, con showdown.
      mano(
        "h2",
        "CO",
        [
          acc("preflop", 0, "raise", 60, 80),
          acc("preflop", 1, "call", 60, 140),
          acc("flop", 0, "bet", 80, 220),
        ],
        true,
      ),
      // h3: rival abre y héroe resube (vpip+pfr+3bet), iguala en flop, con showdown.
      mano(
        "h3",
        "BTN",
        [
          acc("preflop", 1, "raise", 60, 80),
          acc("preflop", 0, "raise", 180, 260),
          acc("preflop", 1, "call", 120, 380),
          acc("flop", 1, "bet", 100, 480),
          acc("flop", 0, "call", 100, 580),
        ],
        true,
      ),
      // h4: héroe foldea (sin vpip), sin showdown.
      mano("h4", "SB", [acc("preflop", 1, "raise", 60, 80), acc("preflop", 0, "fold", 0, 80)], false),
    ];
    const r = analyzeHistories(manos);
    expect(r.sampleN).toBe(4);
    expect(r.overall.vpip).toBeCloseTo(0.75, 10);
    expect(r.overall.pfr).toBeCloseTo(0.5, 10);
    expect(r.overall.threeBet).toBeCloseTo(0.25, 10);
    expect(r.overall.showdownRate).toBeCloseTo(0.5, 10);
    expect(r.overall.wtsd).toBeCloseTo(1, 10);
    expect(r.overall.aggro).toBeCloseTo(1, 10);
  });

  it("por posición: el héroe rota SB/BB/UTG", () => {
    const manos: HandRecord[] = [
      mano("sb1", "SB", [acc("preflop", 1, "raise", 60, 80), acc("preflop", 0, "call", 60, 140)], false),
      mano("bb1", "BB", [acc("preflop", 1, "raise", 60, 80), acc("preflop", 0, "fold", 0, 80)], false),
      mano("utg1", "UTG", [acc("preflop", 0, "raise", 60, 80), acc("preflop", 1, "fold", 0, 80)], false),
    ];
    const r = analyzeHistories(manos);
    expect(r.sampleN).toBe(3);
    expect(r.byPosition["SB"]).toEqual({ hands: 1, vpip: 1, pfr: 0 });
    expect(r.byPosition["BB"]).toEqual({ hands: 1, vpip: 0, pfr: 0 });
    expect(r.byPosition["UTG"]).toEqual({ hands: 1, vpip: 1, pfr: 1 });
    expect(r.byPosition["CO"]).toEqual({ hands: 0, vpip: 0, pfr: 0 });
    expect(r.byPosition["BTN"].hands).toBe(0);
  });

  it("VPIP_ALTO_EP se emite con 20 manos EP loose y NO con 19", () => {
    const veinte: HandRecord[] = Array.from({ length: 20 }, (_, i) =>
      manoEpLoose(`ep20-${i}`, i % 2 === 0 ? "UTG" : "MP"),
    );
    const r20 = analyzeHistories(veinte);
    const flag20 = r20.flags.find((f) => f.kind === "VPIP_ALTO_EP");
    expect(flag20).toBeDefined();
    expect(flag20?.title).toBe("Juegas demasiadas manos fuera de posición");
    expect(flag20?.detail).toContain("%");
    expect(flag20?.detail).toContain("n=20");
    expect(flag20?.evidenceHandIds.length).toBeGreaterThan(0);
    expect(flag20?.evidenceHandIds.length).toBeLessThanOrEqual(5);

    const diecinueve: HandRecord[] = Array.from({ length: 19 }, (_, i) =>
      manoEpLoose(`ep19-${i}`, i % 2 === 0 ? "UTG" : "MP"),
    );
    const r19 = analyzeHistories(diecinueve);
    expect(r19.flags.find((f) => f.kind === "VPIP_ALTO_EP")).toBeUndefined();
  });

  it("PASIVO_POSTFLOP con aggro 0.2 y muestra suficiente", () => {
    const manos: HandRecord[] = [];
    // 10 manos con call postflop del héroe.
    for (let i = 0; i < 10; i++) {
      manos.push(
        mano(
          `pas-call-${i}`,
          "CO",
          [
            acc("preflop", 0, "call", 40, 60),
            acc("flop", 1, "bet", 50, 110),
            acc("flop", 0, "call", 50, 160),
          ],
          false,
        ),
      );
    }
    // 2 manos con bet postflop del héroe.
    for (let i = 0; i < 2; i++) {
      manos.push(
        mano(
          `pas-bet-${i}`,
          "CO",
          [acc("preflop", 0, "call", 40, 60), acc("flop", 0, "bet", 50, 110)],
          false,
        ),
      );
    }
    // 8 manos con check postflop del héroe (cuentan como muestra y sirven de evidencia).
    for (let i = 0; i < 8; i++) {
      manos.push(
        mano(
          `pas-check-${i}`,
          "CO",
          [acc("preflop", 0, "call", 40, 60), acc("flop", 0, "check", 0, 60)],
          false,
        ),
      );
    }
    const r = analyzeHistories(manos);
    expect(r.overall.aggro).toBeCloseTo(0.2, 10);
    const flag = r.flags.find((f) => f.kind === "PASIVO_POSTFLOP");
    expect(flag).toBeDefined();
    expect(flag?.detail).toContain("n=20");
    expect(flag?.evidenceHandIds.length).toBeGreaterThan(0);
    expect(flag?.evidenceHandIds.length).toBeLessThanOrEqual(5);
  });

  it("OVERFOLD_BB al 90% con 15 oportunidades", () => {
    const manos: HandRecord[] = [];
    // 14 folds en BB ante open + 1 call (14/15 = 93,3% > 85%).
    for (let i = 0; i < 14; i++) {
      manos.push(
        mano(
          `bb-fold-${i}`,
          "BB",
          [acc("preflop", 1, "raise", 60, 80), acc("preflop", 0, "fold", 0, 80)],
          false,
        ),
      );
    }
    manos.push(
      mano(
        "bb-call-1",
        "BB",
        [acc("preflop", 1, "raise", 60, 80), acc("preflop", 0, "call", 60, 140)],
        false,
      ),
    );
    const r = analyzeHistories(manos);
    const flag = r.flags.find((f) => f.kind === "OVERFOLD_BB");
    expect(flag).toBeDefined();
    expect(flag?.detail).toContain("%");
    expect(flag?.detail).toContain("n=15");
    expect(flag?.evidenceHandIds.length).toBeGreaterThan(0);
    expect(flag?.evidenceHandIds.length).toBeLessThanOrEqual(5);
  });

  it("evidenceHandIds existen en el input", () => {
    const manos: HandRecord[] = [];
    for (let i = 0; i < 20; i++) manos.push(manoEpLoose(`ev-ep-${i}`, i % 2 === 0 ? "UTG" : "MP"));
    for (let i = 0; i < 10; i++) {
      manos.push(
        mano(
          `ev-call-${i}`,
          "CO",
          [
            acc("preflop", 0, "call", 40, 60),
            acc("flop", 1, "bet", 50, 110),
            acc("flop", 0, "call", 50, 160),
          ],
          false,
        ),
      );
    }
    for (let i = 0; i < 2; i++) {
      manos.push(
        mano(
          `ev-bet-${i}`,
          "CO",
          [acc("preflop", 0, "call", 40, 60), acc("flop", 0, "bet", 50, 110)],
          false,
        ),
      );
    }
    for (let i = 0; i < 8; i++) {
      manos.push(
        mano(
          `ev-check-${i}`,
          "CO",
          [acc("preflop", 0, "call", 40, 60), acc("flop", 0, "check", 0, 60)],
          false,
        ),
      );
    }
    for (let i = 0; i < 14; i++) {
      manos.push(
        mano(
          `ev-bb-${i}`,
          "BB",
          [acc("preflop", 1, "raise", 60, 80), acc("preflop", 0, "fold", 0, 80)],
          false,
        ),
      );
    }
    manos.push(
      mano(
        "ev-bb-call",
        "BB",
        [acc("preflop", 1, "raise", 60, 80), acc("preflop", 0, "call", 60, 140)],
        false,
      ),
    );
    const validas = new Set(manos.map((h) => h.id));
    const r = analyzeHistories(manos);
    expect(r.flags.length).toBeGreaterThan(0);
    for (const f of r.flags) {
      expect(f.evidenceHandIds.length).toBeGreaterThan(0);
      expect(f.evidenceHandIds.length).toBeLessThanOrEqual(5);
      for (const id of f.evidenceHandIds) {
        expect(validas.has(id)).toBe(true);
      }
    }
  });

  it("manos vacías devuelven sampleN 0 sin flags", () => {
    const r = analyzeHistories([]);
    expect(r.sampleN).toBe(0);
    expect(r.flags).toEqual([]);
    expect(r.overall).toEqual({ vpip: 0, pfr: 0, threeBet: 0, wtsd: 0, showdownRate: 0, aggro: 0 });
    for (const pos of ["SB", "BB", "UTG", "MP", "CO", "BTN"] as PosLabel[]) {
      expect(r.byPosition[pos].hands).toBe(0);
    }
  });

  it("OVERFOLD al 80% con 20 spots", () => {
    const manos: HandRecord[] = [];
    for (let i = 0; i < 16; i++) {
      manos.push(
        mano(
          `of-fold-${i}`,
          "CO",
          [
            acc("preflop", 0, "call", 40, 60),
            acc("flop", 1, "bet", 50, 110),
            acc("flop", 0, "fold", 0, 110),
          ],
          false,
        ),
      );
    }
    for (let i = 0; i < 4; i++) {
      manos.push(
        mano(
          `of-call-${i}`,
          "CO",
          [
            acc("preflop", 0, "call", 40, 60),
            acc("flop", 1, "bet", 50, 110),
            acc("flop", 0, "call", 50, 160),
          ],
          false,
        ),
      );
    }
    const r = analyzeHistories(manos);
    const flag = r.flags.find((f) => f.kind === "OVERFOLD");
    expect(flag).toBeDefined();
    expect(flag?.id).toBe("OVERFOLD");
    expect(flag?.detail).toContain("n=20");
    expect(flag?.detail).toContain("%");
    expect(flag?.evidenceHandIds.length).toBeGreaterThan(0);
    expect(flag?.evidenceHandIds.length).toBeLessThanOrEqual(5);
    expect(flag?.source.length).toBeGreaterThan(0);
  });

  it("MISSED_VALUE con 3 sets sin agresión turn/river y NO salta si apostó", () => {
    const hole = [carta(7, "♠"), carta(7, "♥")];
    const mesa = [carta(7, "♦"), carta(13, "♣"), carta(2, "♠"), carta(5, "♥"), carta(9, "♦")];
    const sinAgro: HandRecord[] = [0, 1, 2].map((i) =>
      manoCon(
        `mv-${i}`,
        "CO",
        [
          acc("preflop", 0, "call", 40, 60),
          acc("flop", 0, "check", 0, 60),
          acc("turn", 0, "check", 0, 60),
          acc("river", 0, "check", 0, 60),
        ],
        true,
        [...hole],
        [...mesa],
      ),
    );
    const r = analyzeHistories(sinAgro);
    const flag = r.flags.find((f) => f.kind === "MISSED_VALUE");
    expect(flag).toBeDefined();
    expect(flag?.id).toBe("MISSED_VALUE");
    expect(flag?.detail).toContain("3");
    expect(flag?.evidenceHandIds.length).toBe(3);
    // Con apuesta en turn sí hay valor extraído: no cuenta como caso.
    const conAgro: HandRecord[] = [0, 1, 2].map((i) =>
      manoCon(
        `mvb-${i}`,
        "CO",
        [
          acc("preflop", 0, "call", 40, 60),
          acc("flop", 0, "check", 0, 60),
          acc("turn", 0, "bet", 60, 120),
          acc("river", 0, "check", 0, 120),
        ],
        true,
        [...hole],
        [...mesa],
      ),
    );
    const r2 = analyzeHistories(conAgro);
    expect(r2.flags.find((f) => f.kind === "MISSED_VALUE")).toBeUndefined();
  });

  it("BAD_SIZING 50% minbets con 20 apuestas", () => {
    const manos: HandRecord[] = [];
    for (let i = 0; i < 10; i++) {
      manos.push(
        mano(
          `bs-min-${i}`,
          "CO",
          [acc("preflop", 0, "call", 40, 60), acc("flop", 0, "bet", 10, 210)],
          false,
        ),
      );
    }
    for (let i = 0; i < 10; i++) {
      manos.push(
        mano(
          `bs-ok-${i}`,
          "CO",
          [acc("preflop", 0, "call", 40, 60), acc("flop", 0, "bet", 60, 160)],
          false,
        ),
      );
    }
    const r = analyzeHistories(manos);
    const flag = r.flags.find((f) => f.kind === "BAD_SIZING");
    expect(flag).toBeDefined();
    expect(flag?.id).toBe("BAD_SIZING");
    expect(flag?.detail).toContain("%");
    expect(flag?.detail).toContain("bote");
    expect(flag?.evidenceHandIds.length).toBeGreaterThan(0);
    expect(flag?.evidenceHandIds.length).toBeLessThanOrEqual(5);
  });

  it("BAD_PREFLOP tier5 VPIP 50% con 20", () => {
    const basura = [carta(7, "♦"), carta(2, "♣")];
    const manos: HandRecord[] = [];
    for (let i = 0; i < 10; i++) {
      manos.push(
        manoCon(
          `bp-call-${i}`,
          "CO",
          [acc("preflop", 1, "raise", 60, 80), acc("preflop", 0, "call", 60, 140)],
          false,
          [...basura],
          [],
        ),
      );
    }
    for (let i = 0; i < 10; i++) {
      manos.push(
        manoCon(
          `bp-fold-${i}`,
          "CO",
          [acc("preflop", 1, "raise", 60, 80), acc("preflop", 0, "fold", 0, 80)],
          false,
          [...basura],
          [],
        ),
      );
    }
    const r = analyzeHistories(manos);
    const flag = r.flags.find((f) => f.kind === "BAD_PREFLOP");
    expect(flag).toBeDefined();
    expect(flag?.id).toBe("BAD_PREFLOP");
    expect(flag?.detail).toContain("n=20");
    expect(flag?.detail).toContain("%");
    expect(flag?.evidenceHandIds.length).toBeGreaterThan(0);
    expect(flag?.evidenceHandIds.length).toBeLessThanOrEqual(5);
  });

  it("OVERAGGRESSION aggro 6 y bbWon<0 con 20", () => {
    const manos: HandRecord[] = [];
    for (let i = 0; i < 12; i++) {
      manos.push(
        manoCon(
          `oa-bet-${i}`,
          "CO",
          [acc("preflop", 0, "call", 40, 60), acc("flop", 0, "bet", 50, 110)],
          false,
          undefined,
          undefined,
          -1,
        ),
      );
    }
    for (let i = 0; i < 2; i++) {
      manos.push(
        manoCon(
          `oa-call-${i}`,
          "CO",
          [
            acc("preflop", 0, "call", 40, 60),
            acc("flop", 1, "bet", 50, 110),
            acc("flop", 0, "call", 50, 160),
          ],
          false,
          undefined,
          undefined,
          -1,
        ),
      );
    }
    for (let i = 0; i < 6; i++) {
      manos.push(
        manoCon(
          `oa-check-${i}`,
          "CO",
          [acc("preflop", 0, "call", 40, 60), acc("flop", 0, "check", 0, 60)],
          false,
          undefined,
          undefined,
          -1,
        ),
      );
    }
    const r = analyzeHistories(manos);
    expect(r.overall.aggro).toBeCloseTo(6, 10);
    const flag = r.flags.find((f) => f.kind === "OVERAGGRESSION");
    expect(flag).toBeDefined();
    expect(flag?.id).toBe("OVERAGGRESSION");
    expect(flag?.detail).toContain("BB");
    expect(flag?.evidenceHandIds.length).toBeGreaterThan(0);
    expect(flag?.evidenceHandIds.length).toBeLessThanOrEqual(5);
  });

  it("vacío e insuficiente sin flags nuevos", () => {
    const r0 = analyzeHistories([]);
    for (const k of NUEVOS) {
      expect(r0.flags.find((f) => f.kind === k)).toBeUndefined();
    }
    // Insuficiente OVERFOLD: 5 folds (denominador <15) aunque sea 100%.
    const pocosFolds: HandRecord[] = Array.from({ length: 5 }, (_, i) =>
      mano(
        `ins-fold-${i}`,
        "CO",
        [
          acc("preflop", 0, "call", 40, 60),
          acc("flop", 1, "bet", 50, 110),
          acc("flop", 0, "fold", 0, 110),
        ],
        false,
      ),
    );
    const r1 = analyzeHistories(pocosFolds);
    for (const k of NUEVOS) {
      expect(r1.flags.find((f) => f.kind === k)).toBeUndefined();
    }
    // Insuficiente MISSED_VALUE: solo 2 casos (<3).
    const hole = [carta(7, "♠"), carta(7, "♥")];
    const mesa = [carta(7, "♦"), carta(13, "♣"), carta(2, "♠"), carta(5, "♥"), carta(9, "♦")];
    const dosCasos: HandRecord[] = [0, 1].map((i) =>
      manoCon(
        `ins-mv-${i}`,
        "CO",
        [acc("preflop", 0, "call", 40, 60), acc("turn", 0, "check", 0, 60)],
        true,
        [...hole],
        [...mesa],
      ),
    );
    const r2 = analyzeHistories(dosCasos);
    expect(r2.flags.find((f) => f.kind === "MISSED_VALUE")).toBeUndefined();
    // Insuficiente BAD_SIZING: 5 extremas (<15).
    const pocasApuestas: HandRecord[] = Array.from({ length: 5 }, (_, i) =>
      mano(`ins-bs-${i}`, "CO", [acc("flop", 0, "bet", 10, 210)], false),
    );
    const r3 = analyzeHistories(pocasApuestas);
    expect(r3.flags.find((f) => f.kind === "BAD_SIZING")).toBeUndefined();
    // Insuficiente BAD_PREFLOP: 5 débiles (<15).
    const basura = [carta(7, "♦"), carta(2, "♣")];
    const pocasDebiles: HandRecord[] = Array.from({ length: 5 }, (_, i) =>
      manoCon(
        `ins-bp-${i}`,
        "CO",
        [acc("preflop", 1, "raise", 60, 80), acc("preflop", 0, "call", 60, 140)],
        false,
        [...basura],
        [],
      ),
    );
    const r4 = analyzeHistories(pocasDebiles);
    expect(r4.flags.find((f) => f.kind === "BAD_PREFLOP")).toBeUndefined();
    // Insuficiente OVERAGGRESSION: aggro alto y perdiendo pero n=5 (<20).
    const pocasAggro: HandRecord[] = Array.from({ length: 5 }, (_, i) =>
      manoCon(
        `ins-oa-${i}`,
        "CO",
        [acc("preflop", 0, "call", 40, 60), acc("flop", 0, "bet", 50, 110)],
        false,
        undefined,
        undefined,
        -1,
      ),
    );
    const r5 = analyzeHistories(pocasAggro);
    expect(r5.flags.find((f) => f.kind === "OVERAGGRESSION")).toBeUndefined();
  });
});
