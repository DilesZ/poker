"use client";
// Panel de experimentos: GET /api/cfr/experiments al montar + botón Recargar.
// Tabla (id, juego, alg, iters, expl 4dec, evals, fecha) + comparativa A vs B.
//
// NOTA DE ARQUITECTURA: la comparación se ejecuta EN EL CLIENTE importando
// compareExperiments de "@/lib/experiments/compare", que es PURO (sin node:fs
// y por tanto seguro en el bundle). La referencia canónica es lib; este panel
// es solo una vista. Los experimentos completos (curva + evaluaciones) se
// piden bajo demanda a GET /api/cfr/experiments/[id].

import { useCallback, useEffect, useState } from "react";
import { compareExperiments, type ComparedMetric } from "@/lib/experiments/compare";
import type { Experiment } from "@/lib/experiments/types";

interface ExperimentoMeta {
  id: string;
  name?: string;
  createdAt?: string;
  algorithm?: string;
  game?: string;
  iterations?: number;
  seed?: number;
  exploitability?: number;
  ckptVersion?: string | number;
  evals?: number;
}

function fmtExpl(v: unknown): string {
  return typeof v === "number" && Number.isFinite(v) ? v.toFixed(4) : "—";
}

function fmtNum(v: unknown, digits = 2): string {
  return typeof v === "number" && Number.isFinite(v) ? v.toFixed(digits) : "—";
}

function formatDate(ts: unknown): string {
  if (ts == null || ts === "") return "—";
  const d = typeof ts === "number" ? new Date(ts) : new Date(String(ts));
  if (Number.isNaN(d.getTime())) return String(ts);
  return d.toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function esExperimento(v: unknown): v is Experiment {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e["id"] === "string" &&
    e["checkpoint"] !== null &&
    typeof e["checkpoint"] === "object" &&
    Array.isArray(e["curve"]) &&
    Array.isArray(e["evaluations"])
  );
}

export default function ExperimentsPanel() {
  const [items, setItems] = useState<ExperimentoMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [idA, setIdA] = useState("");
  const [idB, setIdB] = useState("");
  const [comparando, setComparando] = useState(false);
  const [filas, setFilas] = useState<ComparedMetric[] | null>(null);
  const [errorCmp, setErrorCmp] = useState<string | null>(null);

  const procesarRespuesta = useCallback(async (res: Response): Promise<void> => {
    const data: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const msg =
        data !== null && typeof data === "object" && "error" in data
          ? String((data as Record<string, unknown>).error)
          : `Error HTTP ${res.status}`;
      throw new Error(msg);
    }
    const list =
      data !== null && typeof data === "object" && Array.isArray((data as { experiments?: unknown }).experiments)
        ? ((data as { experiments: ExperimentoMeta[] }).experiments ?? [])
        : [];
    setItems(list);
    if (list.length >= 1 && list[0]) {
      setIdA((prev) => (prev === "" ? (list[0] as ExperimentoMeta).id : prev));
    }
    if (list.length >= 2 && list[1]) {
      setIdB((prev) => (prev === "" ? (list[1] as ExperimentoMeta).id : prev));
    }
    setFilas(null);
    setErrorCmp(null);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/cfr/experiments", { cache: "no-store" });
      await procesarRespuesta(res);
    } catch (e) {
      setError(
        e instanceof Error
          ? `No se pudieron cargar los experimentos: ${e.message}`
          : "No se pudieron cargar los experimentos.",
      );
    } finally {
      setLoading(false);
    }
  }, [procesarRespuesta]);

  useEffect(() => {
    let vivo = true;
    fetch("/api/cfr/experiments", { cache: "no-store" })
      .then((res) => {
        if (!vivo) return;
        return procesarRespuesta(res);
      })
      .catch((e: unknown) => {
        if (!vivo) return;
        setError(
          e instanceof Error
            ? `No se pudieron cargar los experimentos: ${e.message}`
            : "No se pudieron cargar los experimentos.",
        );
      })
      .finally(() => {
        if (vivo) setLoading(false);
      });
    return () => {
      vivo = false;
    };
  }, [procesarRespuesta]);

  async function cargarCompleto(id: string): Promise<Experiment> {
    const res = await fetch(`/api/cfr/experiments/${encodeURIComponent(id)}`, { cache: "no-store" });
    const data: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const msg =
        data !== null && typeof data === "object" && "error" in data
          ? String((data as Record<string, unknown>).error)
          : `Error HTTP ${res.status}`;
      throw new Error(msg);
    }
    const exp =
      data !== null && typeof data === "object"
        ? (data as { experiment?: unknown }).experiment
        : undefined;
    if (!esExperimento(exp)) throw new Error(`Respuesta inesperada para "${id}" (sin experiment).`);
    return exp;
  }

  async function handleComparar() {
    setErrorCmp(null);
    setFilas(null);
    const a = idA.trim();
    const b = idB.trim();
    if (!a || !b) {
      setErrorCmp("Elige dos experimentos (A y B) de la lista.");
      return;
    }
    setComparando(true);
    try {
      const [expA, expB] = await Promise.all([cargarCompleto(a), cargarCompleto(b)]);
      setFilas(compareExperiments(expA, expB));
    } catch (e) {
      setErrorCmp(
        e instanceof Error ? `No se pudo comparar: ${e.message}` : "No se pudo comparar.",
      );
    } finally {
      setComparando(false);
    }
  }

  return (
    <section className="train-panel" aria-label="Experimentos">
      <h2>Experimentos</h2>
      <div className="train-actions">
        <button
          type="button"
          className="btn-ps btn-small btn-ps-ghost"
          onClick={() => void load()}
          disabled={loading}
        >
          {loading ? "Cargando…" : "Recargar"}
        </button>
        <span className="poker-muted">
          {loading ? "Consultando /api/cfr/experiments…" : `${items.length} experimentos`}
        </span>
      </div>
      {error ? (
        <p className="lab-error" role="alert">
          {error}
        </p>
      ) : null}
      {!error && items.length === 0 && !loading ? (
        <p className="poker-muted">
          Sin experimentos todavía. Crea el primero con{" "}
          <code>npm run experiment -- --name exp-001 --game kuhn</code>.
        </p>
      ) : null}
      {items.length > 0 ? (
        <div className="lab-table-wrap">
          <table className="poker-table-simple">
            <thead>
              <tr>
                <th>Id</th>
                <th>Juego</th>
                <th>Alg</th>
                <th>Iters</th>
                <th>Expl.</th>
                <th>Evals</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {items.map((e) => (
                <tr key={e.id}>
                  <td>
                    <code>{e.id}</code>
                  </td>
                  <td>{e.game ?? "—"}</td>
                  <td>{e.algorithm ?? "—"}</td>
                  <td>{e.iterations ?? "—"}</td>
                  <td>{fmtExpl(e.exploitability)}</td>
                  <td>{e.evals ?? "—"}</td>
                  <td>{formatDate(e.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {items.length >= 2 ? (
        <div className="lab-form">
          <div className="lab-row">
            <label className="lab-field">
              Experimento A
              <select value={idA} onChange={(e) => setIdA(e.target.value)} disabled={comparando}>
                <option value="">— elegir —</option>
                {items.map((e) => (
                  <option key={`a-${e.id}`} value={e.id}>
                    {e.id}
                  </option>
                ))}
              </select>
            </label>
            <label className="lab-field">
              Experimento B
              <select value={idB} onChange={(e) => setIdB(e.target.value)} disabled={comparando}>
                <option value="">— elegir —</option>
                {items.map((e) => (
                  <option key={`b-${e.id}`} value={e.id}>
                    {e.id}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="train-actions">
            <button
              type="button"
              className="btn-ps"
              onClick={() => void handleComparar()}
              disabled={comparando}
            >
              {comparando ? "Comparando…" : "Comparar A vs B"}
            </button>
          </div>
          {errorCmp ? (
            <p className="lab-error" role="alert">
              {errorCmp}
            </p>
          ) : null}
          {filas ? (
            <div className="lab-table-wrap">
              <table className="poker-table-simple">
                <thead>
                  <tr>
                    <th>Métrica</th>
                    <th>A</th>
                    <th>B</th>
                    <th>Δ (B−A)</th>
                    <th>Signif.</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => (
                    <tr key={f.metric}>
                      <td>
                        <code>{f.metric}</code>
                        {f.note ? <span className="poker-muted"> · {f.note}</span> : null}
                      </td>
                      <td>{fmtNum(f.a, 4)}</td>
                      <td>{fmtNum(f.b, 4)}</td>
                      <td>{fmtNum(f.delta, 4)}</td>
                      <td>{f.significant ? "sí" : "no"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
