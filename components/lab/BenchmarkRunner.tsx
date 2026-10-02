"use client";
// Benchmark: enfrenta dos lados configurables vía POST /api/cfr/evaluate.
// Cada lado: kind baseline (id) o ckpt (path). Muestra bb/100, IC95%, stats y misses.

import { useState } from "react";

type SideKind = "baseline" | "ckpt";

interface EvalResultBody {
  bb100A?: number;
  sdPorManoBB?: number;
  ci95?: unknown;
  statsA?: unknown;
  statsB?: unknown;
  [key: string]: unknown;
}

interface EvalResponse {
  result?: EvalResultBody;
  missesA?: unknown;
  missesB?: unknown;
  misses?: unknown;
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
    if ("low" in o && "high" in o) return `[${fmtNum(o.low)}, ${fmtNum(o.high)}]`;
    return JSON.stringify(o);
  }
  if (typeof ci === "number") return `±${ci.toFixed(2)}`;
  return "—";
}

function fmtStats(s: unknown): string {
  if (s == null) return "—";
  if (typeof s === "string" || typeof s === "number") return String(s);
  try {
    return JSON.stringify(s);
  } catch {
    return "—";
  }
}

function SideFields({
  label,
  kind,
  setKind,
  id,
  setId,
  path,
  setPath,
  disabled,
}: {
  label: string;
  kind: SideKind;
  setKind: (k: SideKind) => void;
  id: string;
  setId: (v: string) => void;
  path: string;
  setPath: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <fieldset className="lab-field" disabled={disabled}>
      <legend>{label}</legend>
      <div className="lab-row">
        <label className="lab-field">
          Tipo
          <select value={kind} onChange={(e) => setKind(e.target.value as SideKind)}>
            <option value="baseline">baseline (id)</option>
            <option value="ckpt">ckpt (path)</option>
          </select>
        </label>
        {kind === "baseline" ? (
          <label className="lab-field">
            ID baseline
            <input
              type="text"
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="Ej.: random / call-station"
            />
          </label>
        ) : (
          <label className="lab-field">
            Path checkpoint
            <input
              type="text"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="Ej.: cfr-kuhn-50000.json"
            />
          </label>
        )}
      </div>
    </fieldset>
  );
}

export default function BenchmarkRunner() {
  const [kindA, setKindA] = useState<SideKind>("baseline");
  const [idA, setIdA] = useState("random");
  const [pathA, setPathA] = useState("");
  const [kindB, setKindB] = useState<SideKind>("ckpt");
  const [idB, setIdB] = useState("random");
  const [pathB, setPathB] = useState("");
  const [hands, setHands] = useState("500");
  const [seed, setSeed] = useState("0");
  const [fallback, setFallback] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<EvalResponse | null>(null);

  async function handleRun() {
    setError(null);
    setData(null);
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
    const refA = kindA === "baseline" ? idA.trim() : pathA.trim();
    const refB = kindB === "baseline" ? idB.trim() : pathB.trim();
    if (!refA || !refB) {
      setError("Completa la referencia (id o path) de ambos lados.");
      return;
    }
    const a =
      kindA === "baseline" ? { kind: "baseline", id: refA } : { kind: "ckpt", path: refA };
    const b =
      kindB === "baseline" ? { kind: "baseline", id: refB } : { kind: "ckpt", path: refB };
    setLoading(true);
    try {
      const body: Record<string, unknown> = { a, b, hands: nHands, seed: seedNum };
      if (fallback.trim() !== "") body.fallback = fallback.trim();
      const res = await fetch("/api/cfr/evaluate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => null)) as EvalResponse | null;
      if (!res.ok) {
        const msg =
          json && typeof json === "object" && "error" in json
            ? String((json as Record<string, unknown>).error)
            : `Error HTTP ${res.status}`;
        throw new Error(msg);
      }
      if (!json || typeof json.result !== "object") {
        throw new Error("Respuesta inesperada del servidor (sin result).");
      }
      setData(json);
    } catch (e) {
      setError(
        e instanceof Error
          ? `No se pudo ejecutar el benchmark: ${e.message}`
          : "No se pudo ejecutar el benchmark.",
      );
    } finally {
      setLoading(false);
    }
  }

  const r = data?.result;
  const hasMisses = (data?.missesA ?? data?.missesB ?? data?.misses) != null;
  const misses = hasMisses
    ? { missesA: data?.missesA, missesB: data?.missesB, misses: data?.misses }
    : null;

  return (
    <section className="train-panel" aria-label="Benchmark de checkpoints">
      <h2>Benchmark</h2>
      <p className="poker-muted">
        Enfrenta dos lados (baseline por id o checkpoint por path) con{" "}
        <code>POST /api/cfr/evaluate</code>.
      </p>
      <div className="lab-form">
        <SideFields
          label="Lado A"
          kind={kindA}
          setKind={setKindA}
          id={idA}
          setId={setIdA}
          path={pathA}
          setPath={setPathA}
          disabled={loading}
        />
        <SideFields
          label="Lado B"
          kind={kindB}
          setKind={setKindB}
          id={idB}
          setId={setIdB}
          path={pathB}
          setPath={setPathB}
          disabled={loading}
        />
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
          <label className="lab-field">
            Fallback (opcional)
            <input
              type="text"
              value={fallback}
              onChange={(e) => setFallback(e.target.value)}
              placeholder="Vacío = se omite"
              disabled={loading}
            />
          </label>
        </div>
        <div className="train-actions">
          <button
            type="button"
            className="btn-ps btn-call"
            onClick={() => void handleRun()}
            disabled={loading}
          >
            {loading ? "Evaluando…" : "Ejecutar benchmark"}
          </button>
        </div>
        {error ? (
          <p className="lab-error" role="alert">
            {error}
          </p>
        ) : null}
        {r ? (
          <>
            <div className="lab-table-wrap">
              <table className="poker-table-simple">
                <thead>
                  <tr>
                    <th>Métrica (lado A)</th>
                    <th>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>bb/100 (A)</td>
                    <td>{fmtNum(r.bb100A)}</td>
                  </tr>
                  <tr>
                    <td>Desv. por mano (bb)</td>
                    <td>{fmtNum(r.sdPorManoBB, 4)}</td>
                  </tr>
                  <tr>
                    <td>IC 95%</td>
                    <td>{fmtCI(r.ci95)}</td>
                  </tr>
                  <tr>
                    <td>Stats A</td>
                    <td>
                      <code>{fmtStats(r.statsA)}</code>
                    </td>
                  </tr>
                  <tr>
                    <td>Stats B</td>
                    <td>
                      <code>{fmtStats(r.statsB)}</code>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            {misses && (misses.missesA != null || misses.missesB != null || misses.misses != null) ? (
              <p className="poker-muted">
                Misses: A={fmtStats(misses.missesA)} · B={fmtStats(misses.missesB)}
                {misses.misses != null ? ` · global=${fmtStats(misses.misses)}` : ""}
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    </section>
  );
}
