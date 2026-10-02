"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { rankLabel } from "@/components/poker/Card";
import { PokerTable } from "@/components/poker/PokerTable";
import { AgentDiary } from "@/components/rooms/AgentDiary";
import {
  fetchState,
  joinRoom,
  leaveRoom,
  sendAction,
  type RoomView,
} from "@/lib/rooms/client";
import { potOdds } from "@/lib/poker/game";
import type { GameState, PlayerState, Rank, Suit } from "@/lib/poker/types";

type Accion = {
  type: "fold" | "check" | "call" | "raise" | "allin" | "nextStreet";
  size?: number;
};

type MetaSala = {
  modo?: "1v1" | "multi";
  maxPlayers?: number;
  nombre?: string;
};

const SEGUNDOS_TURNO = 30;
const MAX_LINEAS = 80;
const CLAVE_NOMBRE = "room-my-name";

function claveCliente(code: string): string {
  return `room-client-${code}`;
}

function claveMeta(code: string): string {
  return `room-meta-${code}`;
}

function leerJSON<T>(clave: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const crudo = sessionStorage.getItem(clave);
    return crudo ? (JSON.parse(crudo) as T) : null;
  } catch {
    return null;
  }
}

function mensajeError(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  return typeof e === "string" ? e : "Error desconocido.";
}

function etiquetaAccion(a: Accion): string {
  switch (a.type) {
    case "fold":
      return "fold";
    case "check":
      return "check";
    case "call":
      return "call";
    case "raise":
      return `raise a ${a.size ?? 0}`;
    case "allin":
      return "all-in";
    case "nextStreet":
      return "siguiente calle";
    default:
      return a.type;
  }
}

function aCarta(c: { rank: number; suit: string }) {
  return { rank: c.rank as Rank, suit: c.suit as Suit };
}

interface JugadorBruto {
  id?: unknown;
  name?: unknown;
  stack?: unknown;
  bet?: unknown;
  folded?: unknown;
  allIn?: unknown;
  hole?: unknown;
}

interface EstadoBruto {
  players?: unknown;
  button?: unknown;
  smallBlind?: unknown;
  bigBlind?: unknown;
  street?: unknown;
  board?: unknown;
  pot?: unknown;
  sidePots?: unknown;
  currentBet?: unknown;
  winners?: unknown;
}

function normalizarJugador(bruto: JugadorBruto, indice: number): PlayerState {
  return {
    id: typeof bruto.id === "number" ? bruto.id : indice,
    name:
      typeof bruto.name === "string" && bruto.name
        ? bruto.name
        : `Asiento ${indice + 1}`,
    stack: Number(bruto.stack ?? 0),
    bet: Number(bruto.bet ?? 0),
    folded: !!bruto.folded,
    allIn: !!bruto.allIn,
    hole: Array.isArray(bruto.hole) ? bruto.hole.map((c) => aCarta(c)) : [],
    isHero: false,
  };
}

function verJuego(view: RoomView | null): GameState | null {
  if (!view) return null;
  const bruto = (view.state?.game ?? view.state) as EstadoBruto | null;
  if (!bruto || !Array.isArray(bruto.players) || bruto.players.length === 0) {
    return null;
  }
  const jugadores: PlayerState[] = bruto.players.map((p, i) =>
    normalizarJugador(p, i),
  );

  for (const rp of view.players) {
    let idx = jugadores.findIndex((j) => j.id === rp.seat);
    if (idx < 0 && rp.seat >= 0 && rp.seat < jugadores.length) idx = rp.seat;
    if (idx < 0) continue;
    jugadores[idx].name = rp.name;
    jugadores[idx].stack = rp.stack;
  }

  const asiento = typeof view.yourSeat === "number" ? view.yourSeat : -1;
  const idxHero = jugadores.findIndex((j) => j.id === asiento);
  if (idxHero >= 0) {
    jugadores[idxHero].isHero = true;
    if (Array.isArray(view.myHole) && view.myHole.length > 0) {
      jugadores[idxHero].hole = view.myHole.map(aCarta);
    }
  }

  return {
    players: jugadores,
    button: Number(bruto.button ?? 0),
    smallBlind: Number(bruto.smallBlind ?? 10),
    bigBlind: Number(bruto.bigBlind ?? 20),
    street: (bruto.street ?? "preflop") as GameState["street"],
    board: Array.isArray(bruto.board) ? bruto.board : [],
    deck: [],
    pot: Number(bruto.pot ?? 0),
    sidePots: Array.isArray(bruto.sidePots) ? bruto.sidePots : [],
    currentBet: Number(bruto.currentBet ?? 0),
    winners: Array.isArray(bruto.winners) ? bruto.winners : undefined,
  };
}

function nombreAsiento(view: RoomView | null, seat?: number): string {
  if (seat === undefined) return "—";
  const jugador = view?.players.find((p) => p.seat === seat);
  return jugador ? jugador.name : `Asiento ${seat + 1}`;
}

function puedeEnviar(vista: RoomView, accion: Accion): boolean {
  const esTurno =
    vista.actingSeat !== undefined && vista.actingSeat === vista.yourSeat;
  if (esTurno) return true;
  return accion.type === "nextStreet" && vista.handOver === true;
}

function BarraAcciones({
  calle,
  bote,
  aIgualar,
  odds,
  puedeActuar,
  puedeAvanzar,
  size,
  onSize,
  onAccion,
}: {
  calle: string;
  bote: number;
  aIgualar: number;
  odds: number;
  puedeActuar: boolean;
  puedeAvanzar: boolean;
  size: number;
  onSize: (n: number) => void;
  onAccion: (a: Accion) => void;
}) {
  return (
    <div className="poker-actionbar">
      <button
        type="button"
        className="btn-ps btn-fold"
        disabled={!puedeActuar}
        onClick={() => onAccion({ type: "fold" })}
      >
        Fold
      </button>
      <button
        type="button"
        className="btn-ps btn-call"
        disabled={!puedeActuar}
        onClick={() =>
          onAccion(aIgualar > 0 ? { type: "call" } : { type: "check" })
        }
      >
        {aIgualar > 0 ? `Call ${aIgualar}` : "Check"}
      </button>
      <input
        type="number"
        className="poker-raise-input"
        aria-label="Cantidad a subir"
        min={1}
        value={size}
        disabled={!puedeActuar}
        onChange={(e) => onSize(Number(e.target.value))}
      />
      <button
        type="button"
        className="btn-ps btn-raise"
        disabled={!puedeActuar}
        onClick={() => onAccion({ type: "raise", size })}
      >
        Raise
      </button>
      <button
        type="button"
        className="btn-ps"
        disabled={!puedeActuar}
        onClick={() => onAccion({ type: "allin" })}
      >
        All-in
      </button>
      <button
        type="button"
        className="btn-ps btn-new"
        disabled={!puedeAvanzar}
        onClick={() => onAccion({ type: "nextStreet" })}
      >
        {calle === "river" ? "Showdown" : "Siguiente calle"}
      </button>
      <span className="poker-odds">
        Pot odds: {(odds * 100).toFixed(1)}% · Bote {bote} · A igualar {aIgualar}
      </span>
    </div>
  );
}

function RegistroSala({ lineas }: { lineas: string[] }) {
  const visibles = lineas.slice(-60);
  return (
    <section className="poker-panel" aria-label="Registro de la sala">
      <h2>Registro de la sala</h2>
      {visibles.length === 0 ? (
        <p className="poker-muted">Sin acciones todavía.</p>
      ) : (
        <ol className="poker-log">
          {visibles.map((linea, i) => (
            <li key={i}>{linea}</li>
          ))}
        </ol>
      )}
    </section>
  );
}

function ListaJugadores({
  view,
  clientId,
}: {
  view: RoomView | null;
  clientId: string | null;
}) {
  const jugadores = view?.players ?? [];
  if (jugadores.length === 0) {
    return <p className="poker-muted">Nadie en la sala todavía.</p>;
  }
  return (
    <ul className="salas-jugadores">
      {jugadores.map((p) => (
        <li key={p.clientId} className="salas-jugador">
          <span className="salas-asiento">Asiento {p.seat + 1}</span>
          <span className="salas-nombre">
            {p.name}
            {p.clientId === clientId ? " (tú)" : ""}
          </span>
          <span className={`salas-estado${p.connected ? " on" : " off"}`}>
            {p.connected ? "Conectado" : "Desconectado"}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function SalaPage() {
  const params = useParams<{ code: string }>();
  const code = params?.code ?? "";
  const router = useRouter();

  const [vista, setVista] = useState<RoomView | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [lineas, setLineas] = useState<string[]>([]);
  const [size, setSize] = useState(60);
  const [restante, setRestante] = useState(SEGUNDOS_TURNO);
  const [listo, setListo] = useState(false);
  const [meta, setMeta] = useState<MetaSala | null>(null);
  const [ocultarOverlay, setOcultarOverlay] = useState(false);

  const versionRef = useRef(0);
  const vistaRef = useRef<RoomView | null>(null);
  const pendienteRef = useRef<Accion | null>(null);
  const ocupadoRef = useRef(false);
  const versionVistaRef = useRef(-1);
  const calleRef = useRef("");
  const ganadorRef = useRef("");
  const genteRef = useRef<Array<{ clientId: string; name: string }>>([]);
  const inicioTurnoRef = useRef(0);
  const sembradoRef = useRef(false);

  const registrar = useCallback((v: RoomView) => {
    if (v.version === versionVistaRef.current) return;
    versionVistaRef.current = v.version;

    const juego = verJuego(v);
    const nuevas: string[] = [];

    if (!sembradoRef.current) {
      sembradoRef.current = true;
      calleRef.current = juego?.street ?? "";
      genteRef.current = v.players.map((p) => ({
        clientId: p.clientId,
        name: p.name,
      }));
    } else {
      const anteriores = new Map(
        genteRef.current.map((g) => [g.clientId, g.name]),
      );
      for (const p of v.players) {
        if (!anteriores.has(p.clientId)) {
          nuevas.push(`${p.name} se une a la sala (asiento ${p.seat + 1}).`);
        }
      }
      for (const [id, nombre] of anteriores) {
        if (!v.players.some((p) => p.clientId === id)) {
          nuevas.push(`${nombre} se va de la sala.`);
        }
      }
      genteRef.current = v.players.map((p) => ({
        clientId: p.clientId,
        name: p.name,
      }));

      const calle = juego?.street ?? "";
      if (calle && calle !== calleRef.current) {
        if (calleRef.current) {
          const cartas = juego
            ? juego.board.map((c) => `${rankLabel(c.rank)}${c.suit}`).join(" ")
            : "";
          nuevas.push(
            `—— ${calle.toUpperCase()} ——${cartas ? ` ${cartas}` : ""}`,
          );
        }
        calleRef.current = calle;
      }
    }

    if (v.handOver && v.winnerText && v.winnerText !== ganadorRef.current) {
      ganadorRef.current = v.winnerText;
      nuevas.push(v.winnerText);
    }

    if (nuevas.length > 0) {
      setLineas((prev) => [...prev, ...nuevas].slice(-MAX_LINEAS));
    }
  }, []);

  const aplicar = useCallback(
    (siguiente: RoomView) => {
      vistaRef.current = siguiente;
      versionRef.current = siguiente.version;
      setVista(siguiente);
      setOcultarOverlay(false);
      setRestante(SEGUNDOS_TURNO);
      inicioTurnoRef.current = Date.now();
      registrar(siguiente);
    },
    [registrar],
  );

  const enviar = useCallback(
    async (accion: Accion) => {
      const actual = vistaRef.current;
      if (!code || !clientId || !actual) return;
      if (!puedeEnviar(actual, accion)) return;
      if (ocupadoRef.current) return;
      ocupadoRef.current = true;
      try {
        const siguiente = await sendAction(code, clientId, accion);
        pendienteRef.current = null;
        setLineas((prev) =>
          [...prev, `Tú: ${etiquetaAccion(accion)}.`].slice(-MAX_LINEAS),
        );
        aplicar(siguiente);
        setError(null);
      } catch (e) {
        pendienteRef.current = accion;
        setError(mensajeError(e));
      } finally {
        ocupadoRef.current = false;
      }
    },
    [code, clientId, aplicar],
  );

  const refetch = useCallback(async () => {
    if (!code || !clientId) return;
    try {
      const siguiente = await fetchState(code, clientId, versionRef.current);
      if (!siguiente) return;
      aplicar(siguiente);
      const pendiente = pendienteRef.current;
      if (pendiente && puedeEnviar(siguiente, pendiente)) {
        pendienteRef.current = null;
        await enviar(pendiente);
      }
    } catch (e) {
      setError(mensajeError(e));
    }
  }, [code, clientId, aplicar, enviar]);

  // Arranque separado: solo join (POST) + primer GET. No hay POST /tick;
  // si existiera tick, solo se llamaría cuando hiciera falta arrancar,
  // nunca en cada GET de polling.
  useEffect(() => {
    if (!code) return;
    let cancelado = false;
    (async () => {
      try {
        setMeta(leerJSON<MetaSala>(claveMeta(code)));
        const guardado = leerJSON<{ clientId?: string }>(claveCliente(code));
        let id = guardado?.clientId ?? null;
        if (!id) {
          const nombre =
            (typeof window !== "undefined" &&
              sessionStorage.getItem(CLAVE_NOMBRE)) ||
            "Jugador";
          const sentado = await joinRoom(code, nombre);
          try {
            sessionStorage.setItem(claveCliente(code), JSON.stringify(sentado));
          } catch {
            // sin almacenamiento se reintentará en cada entrada
          }
          id = sentado.clientId;
        }
        if (cancelado) return;
        setClientId(id);
        const primera = await fetchState(code, id, 0);
        if (cancelado) return;
        if (primera) aplicar(primera);
        setCargando(false);
      } catch (e) {
        if (cancelado) return;
        setError(mensajeError(e));
        setCargando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [code, aplicar]);

  const esMiTurno =
    !!vista &&
    vista.actingSeat !== undefined &&
    vista.actingSeat === vista.yourSeat;
  const estaManoTerminada = vista?.handOver === true;

  // Polling adaptativo + pausa en pestaña oculta.
  useEffect(() => {
    if (!code || !clientId) return;
    const ms = estaManoTerminada ? 5000 : esMiTurno ? 800 : 2000;
    const id = window.setInterval(() => {
      if (document.hidden) return;
      void refetch();
    }, ms);
    const alVisibilidad = () => {
      if (!document.hidden) void refetch();
    };
    document.addEventListener("visibilitychange", alVisibilidad);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", alVisibilidad);
    };
  }, [code, clientId, refetch, esMiTurno, estaManoTerminada]);
  const version = vista?.version;

  useEffect(() => {
    if (!esMiTurno) return;
    const id = window.setInterval(() => {
      const transcurrido = Math.floor(
        (Date.now() - inicioTurnoRef.current) / 1000,
      );
      setRestante(Math.max(0, SEGUNDOS_TURNO - transcurrido));
    }, 250);
    return () => window.clearInterval(id);
  }, [esMiTurno, version]);

  async function salirDeLaSala() {
    if (clientId) {
      try {
        await leaveRoom(code, clientId);
      } catch {
        // salimos igualmente: la sala se purgará del lado del servidor
      }
    }
    try {
      sessionStorage.removeItem(claveCliente(code));
    } catch {
      // sin almacenamiento no hay nada que limpiar
    }
    router.push("/salas");
  }

  const juego = verJuego(vista);
  const minJugadores = meta?.maxPlayers
    ? meta.maxPlayers <= 2
      ? 2
      : 3
    : 2;
  const enLobby = !vista || vista.players.length < minJugadores;
  const asiento = vista?.yourSeat ?? -1;
  const hero =
    juego && asiento >= 0
      ? juego.players.find((p) => p.id === asiento)
      : undefined;
  const aIgualar = juego && hero ? Math.max(0, juego.currentBet - hero.bet) : 0;
  const bote = juego?.pot ?? 0;
  const odds = potOdds(aIgualar, bote);
  const puedeActuar =
    esMiTurno && !!hero && !hero.folded && !hero.allIn && !(vista?.handOver ?? false);
  const puedeAvanzar = esMiTurno || (vista?.handOver ?? false);

  if (!code) {
    return (
      <>
        <header className="poker-header">
          <h1>🔒 Sala</h1>
          <p>URL de sala no válida.</p>
        </header>
        <div className="salas-lobby">
          <section className="poker-panel">
            <h2>Falta el código de la sala</h2>
            <p className="poker-muted">
              Abre el enlace desde «Salas privadas» para entrar en una mesa.
            </p>
            <Link className="btn-ps btn-call" href="/salas">
              Ir a salas
            </Link>
          </section>
        </div>
      </>
    );
  }

  if (cargando) {
    return (
      <>
        <header className="poker-header">
          <h1>🔒 Sala {code || "—"}</h1>
          <p>Conectando con la sala…</p>
        </header>
        <div className="salas-lobby">
          <section className="poker-panel">
            <h2>Entrando…</h2>
            <p className="poker-muted">
              Buscando la sala {code || "—"} y su estado actual.
            </p>
          </section>
        </div>
      </>
    );
  }

  return (
    <>
      <header className="poker-header">
        <h1>🔒 Sala {code || "—"}</h1>
        <p>
          {meta?.modo === "1v1"
            ? "1v1 contra el Agente"
            : meta?.modo === "multi"
              ? `Mesa abierta hasta ${meta.maxPlayers ?? 6} con Agente`
              : "Mesa privada con Agente"}{" "}
          · <Link href="/salas">← Otra sala</Link>
        </p>
      </header>

      {error && (
        <div className="salas-error" role="alert">
          <strong>Problema al contactar con la sala.</strong>
          <span>{error}</span>
          <small>
            Si la API /api/rooms todavía no está desplegada, las salas privadas
            no podrán usarse hasta que el backend esté activo.
          </small>
        </div>
      )}

      <div className="poker-grid">
        <main>
          {enLobby ? (
            <section className="poker-panel" aria-label="Lobby de la sala">
              <div className="salas-cabecera">
                <h2>📋 Sala {code}</h2>
                <button
                  type="button"
                  className="btn-ps btn-small btn-fold"
                  onClick={() => void salirDeLaSala()}
                >
                  Salir
                </button>
              </div>
              <p className="poker-muted">
                {vista
                  ? `${vista.players.length} de un mínimo de ${minJugadores} jugadores para empezar.`
                  : "Esperando al servidor de salas…"}
              </p>
              <ListaJugadores view={vista} clientId={clientId} />
              <div className="salas-acciones">
                <button
                  type="button"
                  className={`btn-ps${listo ? " btn-new" : ""}`}
                  onClick={() => setListo((v) => !v)}
                  aria-pressed={listo}
                >
                  {listo ? "✔ Listo" : "Marcar listo"}
                </button>
                <span className="poker-odds">
                  {listo
                    ? "Listo: esperando a que entren los demás."
                    : "Marca listo cuando estés preparado."}
                </span>
              </div>
              <p className="poker-muted">
                La mano arranca al llegar a {minJugadores} jugadores. Tu estado
                de listo se guarda en este navegador.
              </p>
            </section>
          ) : (
            <>
              <div className="salas-cabecera">
                <h2>Mesa de la sala {code}</h2>
                <div className="salas-botones">
                  <span className="poker-odds">
                    {vista.players.length} jugadores · versión {vista.version}
                  </span>
                  <button
                    type="button"
                    className="btn-ps btn-small btn-fold"
                    onClick={() => void salirDeLaSala()}
                  >
                    Salir de la sala
                  </button>
                </div>
              </div>

              <div
                className={`turn-banner${esMiTurno ? "" : " espera"}`}
                role="status"
              >
                {esMiTurno ? (
                  <>
                    <strong>Te toca</strong>
                    <span className="turn-reloj">{restante}s</span>
                    {restante === 0 ? (
                      <span className="turn-aviso">Tiempo agotado</span>
                    ) : restante <= 5 ? (
                      <span className="turn-aviso">¡Quedan pocos segundos!</span>
                    ) : null}
                  </>
                ) : vista.actingSeat !== undefined ? (
                  <span>
                    Turno de {nombreAsiento(vista, vista.actingSeat)} · espera
                    tu oportunidad
                  </span>
                ) : (
                  <span>Esperando el turno…</span>
                )}
              </div>

              <div className="salas-mesa">
                {juego ? (
                  <PokerTable game={juego} />
                ) : (
                  <div className="poker-felt poker-empty">
                    <p>Esperando el reparto de la mano…</p>
                  </div>
                )}

                {vista.handOver && vista.winnerText && !ocultarOverlay && (
                  <div className="winner-overlay" role="status">
                    <div className="winner-card">
                      <h3>Fin de la mano</h3>
                      <p>{vista.winnerText}</p>
                      <div className="winner-botones">
                        <button
                          type="button"
                          className="btn-ps btn-new"
                          disabled={!puedeAvanzar}
                          onClick={() => void enviar({ type: "nextStreet" })}
                        >
                          Siguiente mano
                        </button>
                        <button
                          type="button"
                          className="btn-ps btn-small"
                          onClick={() => setOcultarOverlay(true)}
                        >
                          Ver mesa
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <BarraAcciones
                calle={juego?.street ?? ""}
                bote={bote}
                aIgualar={aIgualar}
                odds={odds}
                puedeActuar={puedeActuar}
                puedeAvanzar={puedeAvanzar}
                size={size}
                onSize={setSize}
                onAccion={(a) => void enviar(a)}
              />

              <section className="poker-panel salas-info" aria-label="Jugadores">
                <h2>Jugadores en la sala</h2>
                <ListaJugadores view={vista} clientId={clientId} />
                <p className="poker-muted">
                  Tu asiento: {asiento >= 0 ? asiento + 1 : "—"} ·{" "}
                  {hero ? `Stack ${hero.stack}` : "Sin asiento todavía"}
                </p>
              </section>
            </>
          )}
        </main>

        <aside className="poker-sidebar">
          <AgentDiary key={code} code={code} lesson={vista?.agentLesson} handId={vista?.version} />
          <RegistroSala lineas={lineas} />
        </aside>
      </div>
    </>
  );
}
