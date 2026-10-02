"use client";
// Lista de checkpoints: GET /api/cfr/checkpoints al montar + botón Recargar.
// Tabla: fichero, algoritmo, juego, iters, exploitabilidad, fecha.

import { useCallback, useEffect, useState } from "react";

interface Checkpoint {
  file: string;
  version?: number | string;
  algorithm?: string;
  game?: string;
  seed?: number | string;
  iterations?: number;
  exploitability?: number;
  timestamp?: string | number;
}

function formatDate(ts: Checkpoint["timestamp"]): string {
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

export default function CheckpointsList() {
  const [items, setItems] = useState<Checkpoint[]>([]);
  // Empieza cargando: la primera carga la hace el efecto de montaje sin
  // setState síncrono (los sets viven solo en continuaciones async).
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const procesarRespuesta = useCallback(
    async (res: Response): Promise<void> => {
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const msg =
          data !== null && typeof data === "object" && "error" in data
            ? String((data as Record<string, unknown>).error)
            : `Error HTTP ${res.status}`;
        throw new Error(msg);
      }
      const list =
        data !== null && typeof data === "object" && Array.isArray((data as { checkpoints?: unknown }).checkpoints)
          ? ((data as { checkpoints: Checkpoint[] }).checkpoints ?? [])
          : [];
      setItems(list);
    },
    [],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/cfr/checkpoints", { cache: "no-store" });
      await procesarRespuesta(res);
    } catch (e) {
      setError(
        e instanceof Error
          ? `No se pudieron cargar los checkpoints: ${e.message}`
          : "No se pudieron cargar los checkpoints.",
      );
    } finally {
      setLoading(false);
    }
  }, [procesarRespuesta]);

  useEffect(() => {
    let vivo = true;
    fetch("/api/cfr/checkpoints", { cache: "no-store" })
      .then((res) => {
        if (!vivo) return;
        return procesarRespuesta(res);
      })
      .catch((e: unknown) => {
        if (!vivo) return;
        setError(
          e instanceof Error
            ? `No se pudieron cargar los checkpoints: ${e.message}`
            : "No se pudieron cargar los checkpoints.",
        );
      })
      .finally(() => {
        if (vivo) setLoading(false);
      });
    return () => {
      vivo = false;
    };
  }, [procesarRespuesta]);

  return (
    <section className="train-panel" aria-label="Checkpoints CFR">
      <h2>Checkpoints</h2>
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
          {loading ? "Consultando /api/cfr/checkpoints…" : `${items.length} checkpoints`}
        </span>
      </div>
      {error ? (
        <p className="lab-error" role="alert">
          {error}
        </p>
      ) : null}
      {!error && items.length === 0 && !loading ? (
        <p className="poker-muted">
          Sin checkpoints todavía. Entrena un modelo para generar el primero.
        </p>
      ) : null}
      {items.length > 0 ? (
        <div className="lab-table-wrap">
          <table className="poker-table-simple">
            <thead>
              <tr>
                <th>Fichero</th>
                <th>Algoritmo</th>
                <th>Juego</th>
                <th>Iters</th>
                <th>Expl.</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c, i) => (
                <tr key={`${c.file ?? i}-${i}`}>
                  <td>
                    <code>{c.file ?? "—"}</code>
                    {c.version != null ? (
                      <span className="poker-muted"> v{String(c.version)}</span>
                    ) : null}
                  </td>
                  <td>{c.algorithm ?? "—"}</td>
                  <td>{c.game ?? "—"}</td>
                  <td>{c.iterations ?? "—"}</td>
                  <td>
                    {typeof c.exploitability === "number"
                      ? c.exploitability.toFixed(4)
                      : "—"}
                  </td>
                  <td>{formatDate(c.timestamp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
