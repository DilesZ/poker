"use client";
// Comparador directo A vs B entre dos checkpoints (HU preflop).
// POST /api/cfr/evaluate con a:{kind:"ckpt",path:A}, b:{kind:"ckpt",path:B}.

import { useState } from "react";

interface CompareResult {
  bb100A?: number;
  sdPorManoBB?: number;
  ci95?: unknown;
  statsA?: unknown;
  statsB?: unknown;
  [key: string]: unknown;
}

function fmtNum(v: unknown, digits = 2): string {
  return typeof v === "number" && Number.isFinite(v) ? v.toFixed(digits) : "—";
}

function fmtCI(ci: unknown): string {
  if (Array.isArray(ci) && ci.length === 2) return `[${fmtNum(ci[0])}, ${fmtNum(ci[1])}]`;
  if (ci && typeof ci === "object") {
    const o = ci as Record<string, unknown>;
    if ("lo" in o && "hi" in o) return `[${fmtNum(o.lo)}, ${fmtNum(o.hi)}]`;
    return JSON.stringify(o);
  }
  if (typeof ci === "number") return `±${ci.toFixed(2)}`;
  return "—";
}

export default function ComparePanel() {
  const [pathA, setPathA] = useState("");
  const [pathB, setPathB] = useState("");
  const [hands, setHands] = useState("500");
  const [seed, setSeed] = useState("0");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CompareResult | null>(null);

  async function handleCompare() {
    setError(null);
    setResult(null);
    const a = pathA.trim();
    const b = pathB.trim();
    if (!a || !b) {
      setError("Indica el path de ambos checkpoints (A y B).");
      return;
    }
    const nHands = Number(hands);
    const seedNum = Number(seed);
    if (!Number.isInteger(nHands) || nHands < 1 || nHands > 2000) {
      setError("Manos inválidas: usa un entero entre 1 y 2000.");
      return;
    }
    if (!Number.isInteger(seedNum) || seedNum < 0) {
      setError("Seed inválida: usa un entero ≥ 0.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/cfr/evaluate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          a: { kind: "ckpt", path: a },
          b: { kind: "ckpt", path: b },
          hands: nHands,
          seed: seedNum,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const msg =
          json && typeof json === "object" && "error" in json
            ? String((json as Record<string, unknown>).error)
            : `Error HTTP ${res.status}`;
        throw new Error(msg);
      }
      const body =
        json && typeof json === "object" && "result" in json
          ? ((json as { result: CompareResult }).result ?? null)
          : null;
      if (!body) throw new Error("Respuesta inesperada del servidor (sin result).");
      setResult(body);
    } catch (e) {
      setError(
        e instanceof Error
          ? `No se pudo comparar: ${e.message}`
          : "No se pudo comparar.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="train-panel" aria-label="Comparar checkpoints">
      <h2>Comparar A vs B</h2>
      <p className="poker-muted">
        Solo para <strong>HU preflop</strong> (<code>holdem-hu-preflop</code>):
        enfrenta dos checkpoints directamente.
      </p>
      <div className="lab-form">
        <label className="lab-field">
          Checkpoint A (path)
          <input
            type="text"
            value={pathA}
            onChange={(e) => setPathA(e.target.value)}
            placeholder="Ej.: cfr-hu-iter500.json"
            disabled={loading}
          />
        </label>
        <label className="lab-field">
          Checkpoint B (path)
          <input
            type="text"
            value={pathB}
            onChange={(e) => setPathB(e.target.value)}
            placeholder="Ej.: cfrplus-hu-iter500.json"
            disabled={loading}
          />
        </label>
        <div className="lab-row">
          <label className="lab-field">
            Manos (máx 2000)
            <input
              type="number"
              min={1}
              max={2000}
              step={1}
              value={hands}
              onChange={(e) => setHands(e.target.value)}
              disabled={loading}
            />
          </label>
          <label className="lab-field">
            Seed
            <input
              type="number"
              min={0}
              step={1}
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              disabled={loading}
            />
          </label>
        </div>
        <div className="train-actions">
          <button
            type="button"
            className="btn-ps"
            onClick={() => void handleCompare()}
            disabled={loading}
          >
            {loading ? "Comparando…" : "Comparar A vs B"}
          </button>
        </div>
        {error ? (
          <p className="lab-error" role="alert">
            {error}
          </p>
        ) : null}
        {result ? (
          <div className="lab-table-wrap">
            <table className="poker-table-simple">
              <thead>
                <tr>
                  <th>Lado</th>
                  <th>bb/100 (A)</th>
                  <th>IC 95%</th>
                  <th>Stats</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>A</td>
                  <td>{fmtNum(result.bb100A)}</td>
                  <td>{fmtCI(result.ci95)}</td>
                  <td>
                    <code>{JSON.stringify(result.statsA ?? "—")}</code>
                  </td>
                </tr>
                <tr>
                  <td>B</td>
                  <td>−{fmtNum(result.bb100A)} (juego suma-cero)</td>
                  <td>{fmtCI(result.ci95)}</td>
                  <td>
                    <code>{JSON.stringify(result.statsB ?? "—")}</code>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : null}
        <p className="poker-muted">
          Nota: ambos lados comparten el mismo fallback postflop del servidor;
          la diferencia medida es solo preflop HU.
        </p>
      </div>
    </section>
  );
}
