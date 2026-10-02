"use client";
// Formulario de entrenamiento CFR: recoge hiperparámetros y lanza
// POST /api/cfr/train. Entrega el resultado al padre vía onResult.

import { useState } from "react";

export interface TrainPoint {
  iteration: number;
  exploitability: number;
}

export interface TrainResult {
  curve: TrainPoint[];
  finalExploitability: number;
  checkpoint?: Record<string, unknown>;
  [key: string]: unknown;
}

const MAX_BY_GAME: Record<string, number> = {
  kuhn: 50000,
  leduc: 5000,
  "holdem-hu-preflop": 500,
};

const ALGORITHMS = ["cfr", "cfr+"] as const;
const GAMES = ["kuhn", "leduc", "holdem-hu-preflop"] as const;

export default function TrainingForm({
  onResult,
}: {
  onResult: (result: TrainResult) => void;
}) {
  const [algorithm, setAlgorithm] = useState<string>("cfr");
  const [game, setGame] = useState<string>("kuhn");
  const [iterations, setIterations] = useState<string>("1000");
  const [seed, setSeed] = useState<string>("0");
  const [population, setPopulation] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const maxIter = MAX_BY_GAME[game] ?? 50000;

  async function handleTrain() {
    setError(null);
    setOk(null);
    const iters = Number(iterations);
    const seedNum = Number(seed);
    if (!Number.isInteger(iters) || iters < 1 || iters > maxIter) {
      setError(
        `Iteraciones inválidas: usa un entero entre 1 y ${maxIter} para ${game}.`,
      );
      return;
    }
    if (!Number.isInteger(seedNum) || seedNum < 0) {
      setError("Seed inválida: usa un entero ≥ 0.");
      return;
    }
    let populationParsed: unknown = undefined;
    const popTrim = population.trim();
    if (popTrim !== "") {
      try {
        populationParsed = JSON.parse(popTrim);
      } catch {
        setError(
          "Population JSON inválida: revisa la sintaxis o déjala vacía.",
        );
        return;
      }
    }
    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        game,
        algorithm,
        iterations: iters,
        seed: seedNum,
      };
      if (populationParsed !== undefined) body.population = populationParsed;
      const res = await fetch("/api/cfr/train", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const msg =
          data && typeof data === "object" && "error" in data
            ? String((data as Record<string, unknown>).error)
            : `Error HTTP ${res.status}`;
        throw new Error(msg);
      }
      const result = data as TrainResult;
      if (!result || !Array.isArray(result.curve)) {
        throw new Error("Respuesta inesperada del servidor (sin curve).");
      }
      onResult(result);
      const ckpt =
        result.checkpoint && typeof result.checkpoint === "object"
          ? (result.checkpoint as Record<string, unknown>).file
          : undefined;
      setOk(
        `Entrenamiento completado: exploitabilidad final ${Number(
          result.finalExploitability,
        ).toFixed(4)}` + (ckpt ? ` · checkpoint ${String(ckpt)}` : "") + ".",
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? `No se pudo entrenar: ${e.message}`
          : "No se pudo entrenar: error desconocido.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div aria-label="Formulario de entrenamiento CFR">
      <h3>Entrenar modelo</h3>
      <div className="lab-form">
        <div className="lab-row">
          <label className="lab-field">
            Algoritmo
            <select
              value={algorithm}
              onChange={(e) => setAlgorithm(e.target.value)}
              disabled={loading}
            >
              {ALGORITHMS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
          <label className="lab-field">
            Juego
            <select
              value={game}
              onChange={(e) => setGame(e.target.value)}
              disabled={loading}
            >
              {GAMES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="lab-row">
          <label className="lab-field">
            Iteraciones (máx {maxIter})
            <input
              type="number"
              min={1}
              max={maxIter}
              step={1}
              value={iterations}
              onChange={(e) => setIterations(e.target.value)}
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
        <label className="lab-field">
          Population JSON (opcional)
          <textarea
            value={population}
            onChange={(e) => setPopulation(e.target.value)}
            placeholder='Ej.: {"versus": "baseline"} — vacío = se omite'
            disabled={loading}
            rows={3}
          />
        </label>
        <div className="train-actions">
          <button
            type="button"
            className="btn-ps btn-new"
            onClick={handleTrain}
            disabled={loading}
          >
            {loading ? "Entrenando…" : "Entrenar"}
          </button>
        </div>
        {error ? (
          <p className="lab-error" role="alert">
            {error}
          </p>
        ) : null}
        {ok ? <p className="lab-ok">{ok}</p> : null}
        <p className="poker-muted">
          Lanza <code>POST /api/cfr/train</code> con el juego, el algoritmo y
          la seed indicados.
        </p>
      </div>
    </div>
  );
}
