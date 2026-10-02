"use client";
import { useCallback, useEffect, useRef, useState } from "react";

interface Resumen {
  handsPlayed: number;
  epsilon: number;
  lessonsCount: number;
  winrate: number;
  priorsAprendidos: number;
  updatedAt: number | null;
  avgDeltaBB100: number;
  manosConDelta: number;
  situacionesVisitadas: number;
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

interface EvalResp {
  hands: number;
  bb100: number;
  sd: number;
  ci95: number;
  showdownPct: number;
  brainDecisions: number;
  error?: string;
}

interface EvalHist {
  fecha: number;
  bb100: number;
  ci95: number;
}

const VACIO: Resumen = {
  handsPlayed: 0,
  epsilon: 0.9,
  lessonsCount: 0,
  winrate: 0,
  priorsAprendidos: 0,
  updatedAt: null,
  avgDeltaBB100: 0,
  manosConDelta: 0,
  situacionesVisitadas: 0,
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
  const [evaluando, setEvaluando] = useState(false);
  const [evalResultado, setEvalResultado] = useState<string | null>(null);
  const [evalError, setEvalError] = useState<string | null>(null);
  const [evalHist, setEvalHist] = useState<EvalHist[]>([]);
  const [enLiga, setEnLiga] = useState(false);
  const [ligaResultado, setLigaResultado] = useState<string | null>(null);
  const [ligaTerminado, setLigaTerminado] = useState(false);
  const [ligaError, setLigaError] = useState<string | null>(null);
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
        avgDeltaBB100: typeof data.avgDeltaBB100 === "number" ? data.avgDeltaBB100 : 0,
        manosConDelta: typeof data.manosConDelta === "number" ? data.manosConDelta : 0,
        situacionesVisitadas:
          typeof data.situacionesVisitadas === "number" ? data.situacionesVisitadas : 0,
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

  const cargarEval = useCallback(async () => {
    try {
      const res = await fetch("/api/agent/eval", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { ultimo?: EvalResp & { bb100?: number } | null };
      const u = data?.ultimo as unknown as Record<string, unknown> | null | undefined;
      if (u && typeof u === "object" && typeof u["bb100"] === "number") {
        const bb = u["bb100"] as number;
        const ci = typeof u["ci95"] === "number" ? (u["ci95"] as number) : 0;
        setEvalHist((h) => (h.length > 0 ? h : [{ fecha: Date.now(), bb100: bb, ci95: ci }]));
      }
    } catch {
      // best-effort: el historial queda vacío
    }
  }, []);

  useEffect(() => {
    void cargarEval();
  }, [cargarEval]);

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

  async function evaluar() {
    if (entrenando || evaluando) return;
    setEvaluando(true);
    setEvalResultado(null);
    setEvalError(null);
    try {
      const semilla = (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0;
      const res = await fetch("/api/agent/eval", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hands: 1000, seed: semilla }),
      });
      const data = (await res.json()) as EvalResp;
      if (res.status === 501) {
        setEvalResultado("Evaluador aún no disponible (501).");
        return;
      }
      if (!res.ok || data.error) {
        setEvalError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      const bb = typeof data.bb100 === "number" ? data.bb100 : 0;
      const ci = typeof data.ci95 === "number" ? data.ci95 : 0;
      const n = typeof data.hands === "number" ? data.hands : 1000;
      const swRaw = typeof data.showdownPct === "number" ? data.showdownPct : 0;
      const swPct = swRaw <= 1 ? swRaw * 100 : swRaw;
      const dec = typeof data.brainDecisions === "number" ? data.brainDecisions : 0;
      const signo = bb >= 0 ? "+" : "";
      setEvalResultado(
        `${signo}${bb.toFixed(1)} ±${ci.toFixed(1)} bb/100 (IC95, N=${n}) · showdown ${swPct.toFixed(0)}% · decisiones ${dec}`,
      );
      setEvalHist((h) => [{ fecha: Date.now(), bb100: bb, ci95: ci }, ...h].slice(0, 10));
    } catch (e) {
      setEvalError(e instanceof Error ? e.message : "fallo de red");
    } finally {
      setEvaluando(false);
    }
  }

  const maxAbsEval = Math.max(1, ...evalHist.map((e) => Math.abs(e.bb100)));

  async function jugarLigaAhora() {
    if (entrenando || evaluando || enLiga) return;
    setEnLiga(true);
    setLigaResultado(null);
    setLigaTerminado(false);
    setLigaError(null);
    try {
      const semilla = (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0;
      const res = await fetch("/api/agent/liga", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hands: 500, seed: semilla }),
      });
      const data = (await res.json()) as {
        hands?: number;
        reflects?: number;
        sumaBB?: number;
        showdownPct?: number;
        handsPlayed?: number;
        error?: string;
      };
      if (res.status === 501) {
        setLigaResultado("Liga aún no disponible (501).");
        return;
      }
      if (!res.ok || data.error) {
        setLigaError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setLigaResultado(
        `✅ Liga completada: ${data.hands ?? 500} manos × 6 cerebros (${data.reflects ?? "?"} reflects) · sumaBB ${data.sumaBB ?? "?"} · total ${data.handsPlayed ?? "?"}`,
      );
      setLigaTerminado(true);
      await cargar();
    } catch (e) {
      setLigaError(e instanceof Error ? e.message : "fallo de red");
    } finally {
      setEnLiga(false);
    }
  }

  return (
    <section className="poker-panel" aria-label="Cerebro global del servidor">
      <h2>Cerebro global · servidor</h2>
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
            <dt>EV (bb/100)</dt>
            <dd>
              {resumen.avgDeltaBB100 >= 0 ? "+" : ""}
              {resumen.avgDeltaBB100.toFixed(1)}
            </dd>
          </div>
          <div>
            <dt>Priors aprendidos</dt>
            <dd>{resumen.priorsAprendidos}</dd>
          </div>
          <div>
            <dt>Situaciones / 312</dt>
            <dd>{resumen.situacionesVisitadas}</dd>
          </div>
        </dl>
      )}
      <p className="poker-muted">
        El winrate de lecciones engaña: la mayoría de manos pierde las ciegas por diseño
        (hasta foldeando bien). La métrica que importa es el EV en bb/100: si sube, el
        juego gana fichas.
      </p>
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
      <section aria-label="Liga autónoma">
        <h3>Liga autónoma · juega solo</h3>
        <p className="poker-muted">
          El cerebro juega los 6 asientos contra sí mismo y aprende de cada mano, sin que
          juegues tú. En servidor corre cada hora (cron Vercel, 500 manos) y desde tu PC
          con <code>npm run liga</code>. Al terminar verás ✅ abajo.
        </p>
        {ligaError ? <p className="poker-muted">Aviso liga: {ligaError}</p> : null}
        {ligaResultado ? (
          <p className={ligaTerminado ? "train-ok" : "poker-muted"} role="status">
            {ligaResultado}
          </p>
        ) : null}
        <div className="train-actions">
          <button
            type="button"
            className="btn-ps btn-new"
            disabled={entrenando || evaluando || enLiga}
            onClick={() => void jugarLigaAhora()}
          >
            {enLiga ? "Jugando liga…" : "Jugar liga 500 en servidor"}
          </button>
        </div>
      </section>
      <section aria-label="Evaluación del cerebro">
        <h3>Evaluación · ¿gana?</h3>
        <p className="poker-muted">
          Solo mide, no modifica el cerebro: juega 1000 manos del cerebro contra la heurística.
          Criterio de rentable: media &gt;+2 bb/100 con límite inferior del IC95% &gt;0 en 20k
          manos (2 sets de seeds).
        </p>
        {evalError ? <p className="poker-muted">Aviso eval: {evalError}</p> : null}
        {evalResultado ? (
          <p className="poker-muted" role="status">
            {evalResultado}
          </p>
        ) : null}
        <div className="train-actions">
          <button
            type="button"
            className="btn-ps btn-new"
            disabled={entrenando || evaluando}
            onClick={() => void evaluar()}
          >
            {evaluando ? "Evaluando…" : "Evaluar 1000 manos vs heurística"}
          </button>
        </div>
        {evalHist.length > 0 ? (
          <ul className="poker-muted" aria-label="Historial de evaluaciones">
            {evalHist.map((e) => {
              const ancho = Math.min(100, Math.round((Math.abs(e.bb100) / maxAbsEval) * 100));
              const color = e.bb100 >= 0 ? "#2a7" : "#c33";
              const signo = e.bb100 >= 0 ? "+" : "";
              return (
                <li key={e.fecha}>
                  <span>
                    {new Date(e.fecha).toLocaleTimeString()} · {signo}
                    {e.bb100.toFixed(1)} ±{e.ci95.toFixed(1)}
                  </span>{" "}
                  <span
                    aria-hidden="true"
                    style={{
                      display: "inline-block",
                      width: `${ancho}%`,
                      maxWidth: "120px",
                      height: "8px",
                      background: color,
                      verticalAlign: "middle",
                    }}
                  />
                  <span aria-hidden="true">{"█".repeat(Math.min(10, Math.round(ancho / 10)))}</span>
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>
    </section>
  );
}
