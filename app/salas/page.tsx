"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createRoom, joinRoom } from "@/lib/rooms/client";

type Modo = "1v1" | "multi";

function claveCliente(code: string): string {
  return `room-client-${code}`;
}

function claveMeta(code: string): string {
  return `room-meta-${code}`;
}

const CLAVE_NOMBRE = "room-my-name";

function guardar(clave: string, valor: string): void {
  try {
    sessionStorage.setItem(clave, valor);
  } catch {
    // almacenamiento no disponible: la sala seguirá funcionando sin sesión previa
  }
}

function mensajeError(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  return typeof e === "string" ? e : "Error desconocido.";
}

export default function SalasPage() {
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [modo, setModo] = useState<Modo>("1v1");
  const [maxJugadores, setMaxJugadores] = useState(3);
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<Modo | "unirse" | null>(null);

  async function crear(e: FormEvent) {
    e.preventDefault();
    const yo = nombre.trim() || "Jugador";
    const max = modo === "1v1" ? 2 : maxJugadores;
    setOcupado(modo);
    setError(null);
    try {
      const { code } = await createRoom(yo, modo, max);
      guardar(CLAVE_NOMBRE, yo);
      guardar(
        claveMeta(code),
        JSON.stringify({ modo, maxPlayers: max, nombre: yo }),
      );
      try {
        const yoMismo = await joinRoom(code, yo);
        guardar(claveCliente(code), JSON.stringify(yoMismo));
      } catch {
        guardar(claveMeta(code), JSON.stringify({ modo, maxPlayers: max, nombre: yo }));
      }
      router.push(`/salas/${code}`);
    } catch (e2) {
      setError(mensajeError(e2));
      setOcupado(null);
    }
  }

  async function unirse(e: FormEvent) {
    e.preventDefault();
    const code = codigo.trim().toUpperCase();
    const yo = nombre.trim() || "Jugador";
    if (!code) {
      setError("Escribe el código de la sala a la que quieres entrar.");
      return;
    }
    setOcupado("unirse");
    setError(null);
    try {
      const sentado = await joinRoom(code, yo);
      guardar(CLAVE_NOMBRE, sentado.name || yo);
      guardar(claveCliente(code), JSON.stringify(sentado));
      guardar(claveMeta(code), JSON.stringify({ nombre: sentado.name || yo }));
      router.push(`/salas/${code}`);
    } catch (e2) {
      setError(mensajeError(e2));
      setOcupado(null);
    }
  }

  return (
    <>
      <header className="poker-header">
        <span className="poker-eyebrow">Multijugador + IA</span>
        <h1>
          Salas <span className="gold">privadas</span>
        </h1>
        <p>
          Crea una mesa propia o entra con código.{" "}
          <Link href="/">← Volver a la mesa</Link>
        </p>
      </header>

      {error && (
        <div className="salas-error" role="alert">
          <strong>No se pudo completar la operación.</strong>
          <span>{error}</span>
          <small>
            Las salas privadas necesitan la API /api/rooms; si todavía no está
            desplegada, vuelve a intentarlo cuando el backend esté activo.
          </small>
        </div>
      )}

      <div className="salas-lobby">
        <section className="poker-panel" aria-label="Crear sala">
          <h2>Crear sala</h2>
          <form className="salas-form" onSubmit={crear}>
            <label className="salas-campo">
              <span>Tu nombre</span>
              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                maxLength={20}
                placeholder="Ej: Marta"
                required
              />
            </label>

            <div className="salas-toggle" role="group" aria-label="Modo de sala">
              <button
                type="button"
                className={`salas-opcion${modo === "1v1" ? " activa" : ""}`}
                aria-pressed={modo === "1v1"}
                onClick={() => setModo("1v1")}
              >
                1v1 contra Agente
              </button>
              <button
                type="button"
                className={`salas-opcion${modo === "multi" ? " activa" : ""}`}
                aria-pressed={modo === "multi"}
                onClick={() => setModo("multi")}
              >
                Mesa abierta 3-6 con Agente
              </button>
            </div>

            {modo === "multi" && (
              <label className="salas-campo">
                <span>Máximo de jugadores</span>
                <select
                  value={maxJugadores}
                  onChange={(e) => setMaxJugadores(Number(e.target.value))}
                >
                  {[3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>
                      {n} jugadores
                    </option>
                  ))}
                </select>
              </label>
            )}

            <button
              type="submit"
              className="btn-ps btn-new"
              disabled={ocupado !== null}
            >
              {ocupado !== null && ocupado !== "unirse"
                ? "Creando…"
                : "Crear sala"}
            </button>
          </form>
        </section>

        <section className="poker-panel" aria-label="Unirse por código">
          <h2>Unirse por código</h2>
          <form className="salas-form" onSubmit={unirse}>
            <label className="salas-campo">
              <span>Código de la sala</span>
              <input
                type="text"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.toUpperCase())}
                maxLength={12}
                placeholder="ABC123"
                autoCapitalize="characters"
                required
              />
            </label>
            <label className="salas-campo">
              <span>Tu nombre</span>
              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                maxLength={20}
                placeholder="Ej: Marta"
                required
              />
            </label>
            <button
              type="submit"
              className="btn-ps btn-call"
              disabled={ocupado !== null}
            >
              {ocupado === "unirse" ? "Entrando…" : "Entrar en la sala"}
            </button>
          </form>
        </section>

        <section className="poker-panel" aria-label="Cómo funcionan las salas">
          <h2>Cómo funciona</h2>
          <div className="poker-strategy">
            <ul>
              <li>
                Al crear recibirás un <strong>código</strong> de 6 caracteres:
                compártelo para que entren tus rivales.
              </li>
              <li>
                El <strong>Agente</strong> ocupa siempre un asiento: empieza sin
                estrategia y va aprendiendo de cada mano (ver su diario en la
                sala).
              </li>
              <li>
                En modo <strong>1v1</strong> juegas solo contra él; en{" "}
                <strong>mesa abierta</strong> caben de 3 a 6 jugadores.
              </li>
              <li>
                Cada jugador entra con su propio navegador: el asiento y el
                estado de la partida se guardan en la sala, no en tu equipo.
              </li>
            </ul>
          </div>
        </section>
      </div>
    </>
  );
}
