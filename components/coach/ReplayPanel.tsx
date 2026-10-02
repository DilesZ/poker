"use client";
// Replay de manos con EV por acción del héroe.
// Lógica en lib/coach/ev.ts (equity exacta/muestreada, EV honesto con
// "unavailable" donde no hay cálculo fiable). Aquí solo display.
import { useState } from "react";
import { actionContext, actionEV, type EvEstimate } from "../../lib/coach/ev";
import type { HandRecord } from "../../lib/coach/types";
import { usePokerStore } from "../../store/usePokerStore";

const BB_POR_DEFECTO = 20;
const CALLES = ["preflop", "flop", "turn", "river"] as const;
type Calle = (typeof CALLES)[number];

/** HandRecord con cartas opcionales (historiales viejos pueden no traerlas). */
type RecConCartas = HandRecord & {
  heroHole?: { rank: number; suit: string }[];
  board?: { rank: number; suit: string }[];
};

function boardDeCalle(board: { rank: number; suit: string }[], calle: Calle): { rank: number; suit: string }[] {
  if (calle === "preflop") return [];
  if (calle === "flop") return board.slice(0, 3);
  if (calle === "turn") return board.slice(0, 4);
  return board.slice(0, 5);
}

function textoCarta(c: { rank: number; suit: string }): string {
  const r = c.rank === 14 ? "A" : c.rank === 13 ? "K" : c.rank === 12 ? "Q" : c.rank === 11 ? "J" : `${c.rank}`;
  return `${r}${c.suit ?? ""}`;
}

function tieneCartas(rec: RecConCartas): boolean {
  return (
    Array.isArray(rec.heroHole) &&
    rec.heroHole.length === 2 &&
    rec.heroHole.every(
      (c) => c !== null && typeof c === "object" && Number.isFinite(c.rank) && typeof c.suit === "string",
    ) &&
    Array.isArray(rec.board)
  );
}

function textoEV(ev: EvEstimate): string {
  if (ev.kind === "unavailable") return `EV unavailable: ${ev.reason}`;
  const signo = ev.evBB >= 0 ? "+" : "";
  return `${signo}${ev.evBB.toFixed(2)} BB`;
}

function textoPct(x: number): string {
  const safe = Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0;
  return `${(safe * 100).toFixed(1)}%`;
}

// Caché por mano+acción (el turn exacto enumera ~45k duelos; sin caché cada
// render lo recalcularía). Clave: id de mano + índice.
const CACHE_EV = new Map<string, EvEstimate>();
function evCacheado(rec: RecConCartas, idx: number): EvEstimate {
  const clave = `${rec.id}::${idx}`;
  const hit = CACHE_EV.get(clave);
  if (hit) return hit;
  const ev = actionEV(rec, idx, BB_POR_DEFECTO);
  CACHE_EV.set(clave, ev);
  return ev;
}

// ---- Componente ----

export function ReplayPanel() {
  const histories = usePokerStore((s) => s.histories ?? []);
  const [selId, setSelId] = useState<string | undefined>(undefined);

  if (!Array.isArray(histories) || histories.length === 0) {
    return (
      <section className="poker-panel" aria-label="Replay de manos">
        <h2>Replay</h2>
        <p className="poker-muted">Juega una mano para ver el replay con EV por acción.</p>
      </section>
    );
  }

  const ultima = histories[histories.length - 1] as RecConCartas;
  const sel = (histories.find((h) => h.id === (selId ?? ultima?.id)) ?? ultima) as RecConCartas;
  if (!sel) {
    return (
      <section className="poker-panel" aria-label="Replay de manos">
        <h2>Replay</h2>
        <p className="poker-muted">Sin mano seleccionada.</p>
      </section>
    );
  }

  const conCartas = tieneCartas(sel);
  const heroHole = conCartas ? (sel.heroHole as { rank: number; suit: string }[]) : [];
  const boardFull = conCartas && Array.isArray(sel.board) ? sel.board : [];

  const callesPresentes = CALLES.filter((c) => sel.actions.some((a) => a.street === c));
  const bbWon = sel.result?.bbWon ?? 0;
  const showdown = sel.result?.showdown ?? false;

  return (
    <section className="poker-panel" aria-label="Replay de manos">
      <h2>Replay</h2>
      <label className="poker-muted" htmlFor="replay-mano">
        Mano ({histories.length} en historial, última por defecto):
      </label>
      <select
        id="replay-mano"
        value={sel.id}
        onChange={(e) => setSelId(e.target.value)}
        style={{ display: "block", width: "100%", marginTop: 4 }}
      >
        {histories.map((h) => {
          const r = (h as RecConCartas).result;
          const gano = r?.bbWon ?? 0;
          const signo = gano >= 0 ? "+" : "";
          return (
            <option key={h.id} value={h.id}>
              {new Date(h.ts).toLocaleString()} · {signo}
              {gano.toFixed(2)} BB · {r?.showdown ? "SD" : "sin SD"}
            </option>
          );
        })}
      </select>

      {!conCartas ? (
        <p className="poker-muted" style={{ marginTop: 8 }}>
          EV unavailable: mano sin cartas registradas (historial anterior).
        </p>
      ) : (
        <div className="poker-strategy" style={{ marginTop: 8 }}>
          <p className="poker-muted">Héroe: {heroHole.map(textoCarta).join(" ")}</p>
          {callesPresentes.length === 0 ? (
            <p className="poker-muted">Sin acciones del héroe en esta mano.</p>
          ) : (
            <ul>
              {callesPresentes.map((calle) => {
                const mesa = boardDeCalle(boardFull, calle);
                return (
                  <li key={calle}>
                    <strong>
                      {calle.toUpperCase()} · {mesa.length > 0 ? mesa.map(textoCarta).join(" ") : "sin board"}
                    </strong>
                    <ul>
                      {sel.actions.map((a, idx) =>
                        a.street !== calle ? null : (
                          <li key={`${a.street}-${idx}`}>
                            {a.action}
                            {a.amount > 0 ? ` ${a.amount}` : ""} · {textoEV(evCacheado(sel, idx))}
                            {(() => {
                              const ctx = actionContext(sel, idx);
                              if (!ctx) return <> · EV unavailable: contexto no disponible</>;
                              return (
                                <>
                                  {" "}
                                  · Equity {textoPct(ctx.equity)}
                                  {ctx.equityExact ? " (exacta)" : " (estimada)"} · Pot odds{" "}
                                  {textoPct(ctx.potOdds)} · Mano: {ctx.madeHand}
                                </>
                              );
                            })()}
                          </li>
                        ),
                      )}
                    </ul>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      <p className="poker-muted" style={{ marginTop: 8 }}>
        Resultado: {bbWon >= 0 ? "+" : ""}
        {Number.isFinite(bbWon) ? bbWon.toFixed(2) : "—"} BB · showdown: {showdown ? "sí" : "no"}
      </p>
    </section>
  );
}

export default ReplayPanel;
