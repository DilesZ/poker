"use client";
// Coach por datos: analiza HandRecord[] reales del store con lib/coach.
// Sin muestra suficiente (n<5) pide jugar más; nunca porcentajes sin n.
import { useMemo } from "react";
import { analyzeHistories } from "../../lib/coach/analyzer";
import type { CoachReport, FlagKind, HandRecord } from "../../lib/coach/types";
import { usePokerStore } from "../../store/usePokerStore";

const EMPTY_HISTORIES: HandRecord[] = [];

const POS_ORDER = ["SB", "BB", "UTG", "MP", "CO", "BTN", "—"] as const;

const LECCION_POR_KIND: Record<FlagKind, string> = {
  VPIP_ALTO_EP: "Lección: Manos iniciales",
  PASIVO_POSTFLOP: "Lección: Pot odds",
  OVERFOLD_BB: "Lección: Posición",
  OVERFOLD: "Lección: Pot odds",
  MISSED_VALUE: "Lección: Manos iniciales",
  BAD_SIZING: "Lección: Pot odds",
  BAD_PREFLOP: "Lección: Manos iniciales",
  OVERAGGRESSION: "Lección: Posición",
};

function pctText(ratio: number, n: number): string {
  const safe = Number.isFinite(ratio) ? Math.min(1, Math.max(0, ratio)) : 0;
  return `${Math.round(safe * 100)}% (n=${n})`;
}

export function CoachPanel() {
  const histories = usePokerStore((s) => s.histories ?? EMPTY_HISTORIES);
  const count = Array.isArray(histories) ? histories.length : 0;
  const report: CoachReport | null = useMemo(
    () => (count >= 5 ? analyzeHistories(Array.isArray(histories) ? histories : []) : null),
    [histories, count],
  );

  if (!report) {
    const missing = Math.max(0, 5 - count);
    return (
      <section className="poker-panel" aria-label="Coach por datos">
        <h2>Coach por datos</h2>
        <p className="poker-muted">
          Juega {missing} {missing === 1 ? "mano más" : "manos más"} para activar el coach por
          datos (llevas {count}/5).
        </p>
        <div className="poker-strategy">
          <ul>
            <li>
              <strong>Tip inicial:</strong> en early position (UTG/MP) juega solo manos fuertes
              y foldea el resto preflop: el error caro es pagar fuera de posición.
              <br />
              Fuente: wikis locales (panel Estrategia · pestaña «Manos iniciales»).
              <br />
              Lección: Manos iniciales
            </li>
          </ul>
        </div>
      </section>
    );
  }

  const { sampleN, overall, byPosition, flags } = report;
  const tabla = byPosition as Record<string, { hands: number; vpip: number; pfr: number } | undefined>;
  const rows = POS_ORDER.filter((p) => (tabla[p]?.hands ?? 0) > 0).map((p) => ({
    pos: p,
    ...(tabla[p] as { hands: number; vpip: number; pfr: number }),
  }));

  return (
    <section className="poker-panel" aria-label="Coach por datos">
      <h2>Coach por datos</h2>
      <p className="poker-muted">Muestra: n={sampleN} manos. Sin n no hay porcentaje.</p>

      <h3>Global</h3>
      <div className="poker-strategy">
        <ul>
          <li>
            <strong>VPIP {pctText(overall.vpip, sampleN)}</strong> · Lección: Manos iniciales
          </li>
          <li>
            <strong>PFR {pctText(overall.pfr, sampleN)}</strong> · Lección: Manos iniciales
          </li>
          <li>
            <strong>3-bet {pctText(overall.threeBet, sampleN)}</strong> · Lección: Posición
          </li>
          <li>
            <strong>WTSD {pctText(overall.wtsd, sampleN)}</strong> · Lección: Pot odds
          </li>
          <li>
            <strong>Showdown {pctText(overall.showdownRate, sampleN)}</strong> · Lección: Pot
            odds
          </li>
          <li>
            <strong>
              Agresión postflop {Number.isFinite(overall.aggro) ? overall.aggro.toFixed(2) : "0.00"}{" "}
              (n={sampleN})
            </strong>{" "}
            · Lección: Pot odds
          </li>
        </ul>
      </div>

      <h3>Por posición</h3>
      {rows.length === 0 ? (
        <p className="poker-muted">Sin posiciones registradas todavía (n={sampleN}).</p>
      ) : (
        <table className="poker-table-simple">
          <thead>
            <tr>
              <th>Pos</th>
              <th>Manos</th>
              <th>VPIP</th>
              <th>PFR</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.pos}>
                <td>{r.pos}</td>
                <td>{r.hands}</td>
                <td>{pctText(r.vpip, r.hands)}</td>
                <td>{pctText(r.pfr, r.hands)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3>Alertas</h3>
      {flags.length === 0 ? (
        <p className="poker-muted">
          Sin alertas con la muestra actual (n={sampleN}). Los veredictos exigen n≥15–20 según
          el spot: sigue jugando para afinar. Lección: Manos iniciales
        </p>
      ) : (
        <ul className="diary-lista">
          {flags.map((f) => (
            <li key={f.id} className="diary-item">
              <strong>{f.title}</strong>
              <br />
              <span className="diary-texto">{f.detail}</span>
              <br />
              <span className="diary-texto">{f.source}</span>
              <br />
              <span className="diary-texto">{LECCION_POR_KIND[f.kind]}</span>
              <br />
              <span className="diary-hora">
                ver manos:{" "}
                {f.evidenceHandIds.length > 0 ? f.evidenceHandIds.slice(0, 5).join(", ") : "—"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default CoachPanel;
