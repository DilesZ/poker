"use client";
import { useCallback, useEffect, useState } from "react";

interface Resumen {
  handsPlayed: number;
  epsilon: number;
  lessonsCount: number;
  winrate: number;
  priorsAprendidos: number;
  updatedAt: number | null;
}

interface TrainResp {
  hands: number;
  winrateBB100: number;
  showdownPct: number;
  handsPlayed: number;
  error?: string;
}

const VACIO: Resumen = {
  handsPlayed: 0,
  epsilon: 0.9,
  lessonsCount: 0,
  winrate: 0,
  priorsAprendidos: 0,
  updatedAt: null,
};

export default function GlobalBrainPanel() {
  const [resumen, setResumen] = useState<Resumen>(VACIO);
  const [cargando, setCargando] = useState(true);
  const [entrenando, setEntrenando] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch("/api/agent/brain", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as Resumen;
      setResumen({
        handsPlayed: typeof data.handsPlayed === "number" ? data.handsPlayed : 0,
        epsilon: typeof data.epsilon === "number" ? data.epsilon : 0.9,
        lessonsCount: typeof data.lessonsCount === "number" ? data.lessonsCount : 0,
        winrate: typeof data.winrate === "number" ? data.winrate : 0,
        priorsAprendidos: typeof data.priorsAprendidos === "number" ? data.priorsAprendidos : 0,
        updatedAt: typeof data.updatedAt === "number" ? data.updatedAt : null,
      });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "no se pudo cargar");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function entrenar() {
    if (entrenando) return;
    setEntrenando(true);
    setResultado(null);
    setError(null);
    try {
      const res = await fetch("/api/agent/train", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hands: 1000 }),
      });
      const data = (await res.json()) as TrainResp;
      if (res.status === 501) {
        setResultado("Entrenador de servidor aún no disponible (501).");
      } else if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
      } else if (data.error) {
        setError(data.error);
      } else {
        setResultado(
          `${data.hands} manos · ${data.winrateBB100.toFixed(2)} bb/100 · showdown ${(data.showdownPct * 100).toFixed(1)}% · total ${data.handsPlayed}`,
        );
      }
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "fallo de red");
    } finally {
      setEntrenando(false);
    }
  }

  return (
    <section className="poker-panel" aria-label="Cerebro global del servidor">
      <h2>🧠 Cerebro global (servidor)</h2>
      {cargando ? (
        <p className="poker-muted">Cargando…</p>
      ) : (
        <dl className="train-stats">
          <div>
            <dt>Manos</dt>
            <dd>{resumen.handsPlayed}</dd>
          </div>
          <div>
            <dt>ε</dt>
            <dd>{resumen.epsilon.toFixed(2)}</dd>
          </div>
          <div>
            <dt>Lecciones</dt>
            <dd>{resumen.lessonsCount}</dd>
          </div>
          <div>
            <dt>Winrate lecciones</dt>
            <dd>{(resumen.winrate * 100).toFixed(1)}%</dd>
          </div>
          <div>
            <dt>Priors aprendidos</dt>
            <dd>{resumen.priorsAprendidos}</dd>
          </div>
        </dl>
      )}
      {error ? <p className="poker-muted">Aviso: {error}</p> : null}
      {resultado ? <p className="train-ok">{resultado}</p> : null}
      <div className="train-actions">
        <button type="button" className="btn-ps btn-new" disabled={entrenando} onClick={entrenar}>
          {entrenando ? "Entrenando…" : "Entrenar 1000 manos en servidor"}
        </button>
        <button type="button" className="btn-ps btn-small" disabled={cargando} onClick={() => void cargar()}>
          Recargar
        </button>
      </div>
      <p className="poker-muted">Persiste entre PCs vía KV del servidor (TTL 30 días).</p>
    </section>
  );
}
