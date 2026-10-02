"use client";
// Panel de self-play v0.2: corre runSelfPlay en chunks async (setTimeout)
// para no congelar la UI. No toca la mesa existente: solo LEE el motor
// (lib/training) y ESCRIBE la estrategia en localStorage al "Aplicar".
import { useEffect, useRef, useState } from "react";
import { runSelfPlay } from "@/lib/training/selfplay";
import {
  loadStrategy,
  saveStrategy,
  type StrategyVersion,
} from "@/lib/training/strategy";

const TOTAL_HANDS = 1000;
const CHUNK = 50;

type Status = "idle" | "training" | "done";

/** Acumulado de la sesión (los chunks devuelven medias: se ponderan por manos). */
interface Acc {
  hands: number;
  profitBB: number;
  showdowns: number;
  experiences: number;
}

const EMPTY: Acc = { hands: 0, profitBB: 0, showdowns: 0, experiences: 0 };

export default function SelfPlayPanel() {
  const [status, setStatus] = useState<Status>("idle");
  const [acc, setAcc] = useState<Acc>(EMPTY);
  const [version, setVersion] = useState<number>(1);
  const [seed, setSeed] = useState<number>(0);
  const [applied, setApplied] = useState<string | null>(null);

  const accRef = useRef<Acc>(EMPTY);
  const workingRef = useRef<StrategyVersion | null>(null);
  const chunkRef = useRef(0);
  const seedRef = useRef(0);
  const cancelRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Carga la última estrategia aplicada (si existe) sin bloquear el render.
  useEffect(() => {
    const saved = loadStrategy();
    workingRef.current = saved;
    setVersion(saved.version);
    return () => {
      cancelRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function runChunk() {
    const working = workingRef.current;
    if (cancelRef.current || !working) {
      setStatus("idle");
      return;
    }
    // Chunk síncrono pequeño: seed distinto por chunk (variedad),
    // misma base por sesión (reproducible). La UI respira entre chunks.
    const res = runSelfPlay(CHUNK, seedRef.current + chunkRef.current, working);
    workingRef.current = res.updatedStrategy;
    accRef.current = {
      hands: accRef.current.hands + res.hands,
      profitBB: accRef.current.profitBB + (res.winrateBB100 / 100) * res.hands,
      showdowns: accRef.current.showdowns + res.showdownPct * res.hands,
      experiences: accRef.current.experiences + res.experiences.length,
    };
    chunkRef.current += 1;
    setAcc({ ...accRef.current });

    if (accRef.current.hands >= TOTAL_HANDS) {
      setVersion(workingRef.current.version);
      setStatus("done");
      return;
    }
    timerRef.current = setTimeout(runChunk, 0);
  }

  function startTraining() {
    if (status === "training") return;
    const base = Math.floor(Math.random() * 2 ** 31);
    seedRef.current = base;
    setSeed(base);
    workingRef.current = loadStrategy();
    accRef.current = EMPTY;
    chunkRef.current = 0;
    cancelRef.current = false;
    setAcc(EMPTY);
    setApplied(null);
    setStatus("training");
    timerRef.current = setTimeout(runChunk, 0);
  }

  function cancelTraining() {
    cancelRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    setStatus("idle");
  }

  function applyToTable() {
    const working = workingRef.current;
    if (!working) return;
    saveStrategy(working);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("poker-strategy"));
    }
    setApplied(
      `Estrategia v${working.version} guardada (${acc.hands} manos, seed ${seedRef.current}). La mesa la usará como base de la IA.`,
    );
  }

  const done = acc.hands;
  const pct = Math.min(100, Math.round((done / TOTAL_HANDS) * 100));
  const winrate = done > 0 ? (acc.profitBB / done) * 100 : 0;
  const showdown = done > 0 ? (acc.showdowns / done) * 100 : 0;

  return (
    <section className="train-panel" aria-label="Entrenamiento self-play">
      <h2>Self-play local</h2>
      <p className="poker-muted">
        La estrategia juega {TOTAL_HANDS} manos contra 5 copias de sí misma,
        en bloques de {CHUNK} para no congelar la página.
      </p>

      <div className="train-actions">
        {status === "training" ? (
          <button type="button" className="btn-ps btn-fold" onClick={cancelTraining}>
            Cancelar
          </button>
        ) : (
          <button type="button" className="btn-ps btn-new" onClick={startTraining}>
            Entrenar 1000 manos vs sí misma
          </button>
        )}
        <button
          type="button"
          className="btn-ps btn-small"
          disabled={status !== "done"}
          onClick={applyToTable}
          title="Guarda la estrategia en este navegador para la IA de la mesa"
        >
          Aplicar a IA mesa
        </button>
      </div>

      <div
        className="train-progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={TOTAL_HANDS}
        aria-valuenow={done}
      >
        <div className="train-bar" style={{ width: `${pct}%` }} />
      </div>
      <p className="poker-muted">
        {done}/{TOTAL_HANDS} manos ({pct}%)
        {status === "training" ? " · entrenando…" : ""}
        {done > 0 ? ` · seed ${seed} · ${acc.experiences} experiencias` : ""}
      </p>

      <dl className="train-stats">
        <div>
          <dt>Winrate (héroe)</dt>
          <dd>{done > 0 ? winrate.toFixed(2) : "—"} bb/100</dd>
        </div>
        <div>
          <dt>Showdown</dt>
          <dd>{done > 0 ? showdown.toFixed(1) : "—"}%</dd>
        </div>
        <div>
          <dt>Versión estrategia</dt>
          <dd>
            v{version} · {done} manos
          </dd>
        </div>
      </dl>

      {applied ? <p className="train-ok">{applied}</p> : null}
      <p className="poker-muted">
        Nota: los 6 asientos usan la misma estrategia, así que el winrate
        esperado a largo plazo es ≈ 0. Un valor distinto de 0 en 1000 manos
        es varianza (o un bug), no edge. Motor determinista por seed.
      </p>
    </section>
  );
}
