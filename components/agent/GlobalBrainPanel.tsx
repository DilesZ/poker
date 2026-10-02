"use client";
import { useCallback, useEffect, useRef, useState } from "react";

interface Resumen {
  handsPlayed: number;
  epsilon: number;
  lessonsCount: number;
  winrate: number;
  priorsAprendidos: number;
  updatedAt: number | null;
}

interface TrainResp {
  jobId?: string;
  hands: number;
  winrateBB100: number;
  showdownPct: number;
  handsPlayed: number;
  recorte?: boolean;
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

const TROZO = 1000;

export default function GlobalBrainPanel() {
  const [resumen, setResumen] = useState<Resumen>(VACIO);
  const [cargando, setCargando] = useState(true);
  const [entrenando, setEntrenando] = useState(false);
  const [objetivo, setObjetivo] = useState(5000);
  const [hechas, setHechas] = useState(0);
  const [resultado, setResultado] = useState<string | null>(null);
  const [terminado, setTerminado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelar = useRef(false);

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

  useEffect(() => () => {
    cancelar.current = true;
  }, []);

  async function entrenar() {
    if (entrenando) return;
    cancelar.current = false;
    setEntrenando(true);
    setResultado(null);
    setTerminado(null);
    setError(null);
    setHechas(0);
    try {
      let acumulado = 0;
      let ultimoBb = 0;
      let ultimoSd = 0;
      let semilla = (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0;
      while (acumulado < objetivo) {
        if (cancelar.current) {
          setResultado(`Cancelado en ${acumulado}/${objetivo}. Progreso guardado en el servidor.`);
          break;
        }
        const trozo = Math.min(TROZO, objetivo - acumulado);
        const res = await fetch("/api/agent/train", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ hands: trozo, seed: semilla, total: objetivo }),
        });
        const data = (await res.json()) as TrainResp;
        if (res.status === 501) {
          setResultado("Entrenador de servidor aún no disponible (501).");
          break;
        }
        if (!res.ok || data.error) {
          setError(data.error ?? `HTTP ${res.status}`);
          break;
        }
        acumulado += data.hands;
        semilla = (semilla + 7919) >>> 0;
        ultimoBb = data.winrateBB100;
        ultimoSd = data.showdownPct;
        setHechas(acumulado);
        setResultado(
          `${acumulado}/${objetivo} · último trozo ${data.winrateBB100.toFixed(1)} bb/100 · showdown ${(data.showdownPct * 100).toFixed(0)}%`,
        );
        await cargar();
      }
      if (acumulado >= objetivo) {
        setTerminado(
          `✅ Entrenamiento completado: ${acumulado} manos · ${ultimoBb.toFixed(1)} bb/100 (trozo final) · showdown ${(ultimoSd * 100).toFixed(0)}%. Estado guardado en el servidor (KV).`,
        );
      }
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "fallo de red");
    } finally {
      setEntrenando(false);
    }
  }

  const pct = objetivo > 0 ? Math.min(100, Math.round((hechas / objetivo) * 100)) : 0;

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
      {resultado && !terminado ? (
        <p className="poker-muted" role="status">
          {resultado}
        </p>
      ) : null}
      {terminado ? (
        <p className="train-ok" role="status">
          {terminado}
        </p>
      ) : null}
      {entrenando ? (
        <>
          <div
            className="train-progress"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuetext={`${hechas} de ${objetivo}`}
          >
            <div className="train-bar" style={{ width: `${pct}%` }} />
          </div>
          <span className="poker-muted" role="status">
            Entrenando… {hechas}/{objetivo} ({pct}%)
          </span>
        </>
      ) : null}
      <div className="train-actions">
        <label className="poker-muted" htmlFor="brain-objetivo">
          Objetivo
        </label>
        <select
          id="brain-objetivo"
          className="btn-ps btn-small"
          disabled={entrenando}
          value={objetivo}
          onChange={(e) => setObjetivo(Number(e.target.value))}
        >
          <option value={1000}>1000 manos</option>
          <option value={5000}>5000 manos</option>
          <option value={10000}>10 000 manos</option>
        </select>
        <button type="button" className="btn-ps btn-new" disabled={entrenando} onClick={entrenar}>
          {entrenando ? "Entrenando…" : "Entrenar en servidor"}
        </button>
        {entrenando ? (
          <button
            type="button"
            className="btn-ps btn-small"
            onClick={() => {
              cancelar.current = true;
            }}
          >
            Cancelar
          </button>
        ) : (
          <button type="button" className="btn-ps btn-small" disabled={cargando} onClick={() => void cargar()}>
            Recargar
          </button>
        )}
      </div>
      <p className="poker-muted">
        Progreso por trozos de 1000 (evita timeouts). Al terminar verás ✅ arriba; el estado
        persiste entre PCs vía KV (TTL 30 días). También puedes consultar{" "}
        <code>/api/agent/train</code> (GET) y <code>/api/agent/brain</code>.
      </p>
    </section>
  );
}
