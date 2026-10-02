"use client";
// Barra de torneo SNG 6-max (demo local, fichas sin valor).
// 100% autocontenida con useState: NO usa ni modifica el store de la mesa.
import { useMemo, useState } from "react";
import {
  HANDS_PER_LEVEL,
  SNG_LEVELS,
  SNG_PAID,
  SNG_STARTING_STACK,
  chipsToBb,
} from "@/lib/tournament/sng";

const NAMES = ["Hero", "Villain 1", "Villain 2", "Villain 3", "Villain 4", "Villain 5"];

function nextAlive(stacks: number[], from: number): number {
  for (let k = 1; k <= stacks.length; k++) {
    const i = (from + k) % stacks.length;
    if ((stacks[i] ?? 0) > 0) return i;
  }
  return from;
}

export default function TournamentBar() {
  const [levelIdx, setLevelIdx] = useState(0);
  const [handInLevel, setHandInLevel] = useState(0);
  const [handTotal, setHandTotal] = useState(0);
  const [button, setButton] = useState(0);
  const [stacks, setStacks] = useState<number[]>(() =>
    Array(6).fill(SNG_STARTING_STACK),
  );

  const level = SNG_LEVELS[Math.min(levelIdx, SNG_LEVELS.length - 1)] ?? {
    sb: 10,
    bb: 20,
    ante: 0,
  };
  const handsToNext = HANDS_PER_LEVEL - handInLevel;
  const aliveCount = stacks.filter((s) => s > 0).length;
  const bubble = aliveCount === SNG_PAID + 1;
  const itm = aliveCount > 0 && aliveCount <= SNG_PAID;
  const done = aliveCount <= 1;

  const rows = useMemo(
    () =>
      stacks
        .map((chips, i) => ({ i, name: NAMES[i] ?? `#${i}`, chips }))
        .sort((a, b) => b.chips - a.chips),
    [stacks],
  );

  function badge(i: number, chips: number): string | null {
    if (chips <= 0) return "Eliminado";
    if (itm) return "ITM";
    if (bubble) return "Burbuja";
    if (i === 0) return "Hero";
    return null;
  }

  function playHand() {
    if (done) return;
    const next = [...stacks];
    const sbSeat = nextAlive(next, button);
    const bbSeat = nextAlive(next, sbSeat);
    let pot = 0;
    const take = (seat: number, amount: number) => {
      const pay = Math.min(next[seat] ?? 0, amount);
      next[seat] = (next[seat] ?? 0) - pay;
      pot += pay;
    };
    // Ante de cada superviviente.
    if (level.ante > 0) {
      for (let i = 0; i < next.length; i++) {
        if ((next[i] ?? 0) > 0) take(i, level.ante);
      }
    }
    take(sbSeat, level.sb);
    take(bbSeat, level.bb);
    // Ganador simplificado: sorteo uniforme entre supervivientes.
    const alive = next.map((s, i) => (s > 0 ? i : -1)).filter((i) => i >= 0);
    const winner = alive[Math.floor(Math.random() * alive.length)] ?? sbSeat;
    next[winner] = (next[winner] ?? 0) + pot;
    setStacks(next);
    setButton(nextAlive(next, bbSeat));
    setHandTotal((h) => h + 1);
    if (handInLevel + 1 >= HANDS_PER_LEVEL) {
      setHandInLevel(0);
      setLevelIdx((l) => Math.min(l + 1, SNG_LEVELS.length - 1));
    } else {
      setHandInLevel((h) => h + 1);
    }
  }

  function newSng() {
    setLevelIdx(0);
    setHandInLevel(0);
    setHandTotal(0);
    setButton(0);
    setStacks(Array(6).fill(SNG_STARTING_STACK));
  }

  return (
    <section className="tourney-bar" aria-label="Torneo SNG">
      <div className="tourney-head">
        <div>
          <h2>SNG 6-max · demo local</h2>
          <p className="poker-muted">
            Nivel {levelIdx + 1} · Ciegas {level.sb}/{level.bb}
            {level.ante > 0 ? ` · Ante ${level.ante}` : ""} · Mano{" "}
            {handTotal + 1} · Sube en {handsToNext}{" "}
            {handsToNext === 1 ? "mano" : "manos"}
          </p>
        </div>
        <div className="train-actions">
          <button
            type="button"
            className="btn-ps btn-small"
            disabled={done}
            onClick={playHand}
          >
            Jugar mano
          </button>
          <button type="button" className="btn-ps btn-small btn-new" onClick={newSng}>
            Nuevo SNG
          </button>
        </div>
      </div>

      {done ? (
        <p className="train-ok">
          Torneo terminado.{" "}
          {rows[0] && rows[0].chips > 0 ? `Gana ${rows[0].name}.` : ""}
        </p>
      ) : null}

      <table className="tourney-table">
        <thead>
          <tr>
            <th>Jugador</th>
            <th>Fichas</th>
            <th>BB</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const b = badge(r.i, r.chips);
            return (
              <tr key={r.i} className={r.chips <= 0 ? "out" : ""}>
                <td>{r.name}</td>
                <td>{r.chips}</td>
                <td>{chipsToBb(r.chips, level.bb)}</td>
                <td>
                  {b ? (
                    <span
                      className={
                        b === "Eliminado"
                          ? "badge-out"
                          : b === "ITM"
                            ? "badge-itm"
                            : b === "Burbuja"
                              ? "badge-bubble"
                              : "badge-hero"
                      }
                    >
                      {b}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="poker-muted">
        Simulación simplificada con sorteo uniforme (no es equity real).
        Paga {SNG_PAID} puestos: burbuja con {SNG_PAID + 1} vivos.
      </p>
    </section>
  );
}
