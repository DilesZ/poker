"use client";

import { useEffect, useRef, useState } from "react";

interface Entrada {
  hora: string;
  texto: string;
}

const MAX_ENTRADAS = 8;

function claveDiario(code: string): string {
  return `agent-diary-${code}`;
}

function horaAhora(): string {
  return new Date().toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function desdeObjeto(obj: unknown): string[] {
  if (obj === null || obj === undefined) return [];
  if (Array.isArray(obj)) {
    return obj.flatMap(desdeObjeto).slice(-MAX_ENTRADAS);
  }
  if (typeof obj === "object") {
    const dato = obj as Record<string, unknown>;
    const directas = [
      "texto",
      "text",
      "lesson",
      "leccion",
      "mensaje",
      "message",
      "nota",
      "note",
      "explicacion",
      "aprendizaje",
    ];
    for (const k of directas) {
      const v = dato[k];
      if (typeof v === "string" && v.trim()) return [v.trim()];
      if (Array.isArray(v)) return v.flatMap(desdeObjeto).slice(-MAX_ENTRADAS);
    }
    const metricas = [
      "manos",
      "calle",
      "accion",
      "resultado",
      "regret",
      "ev",
      "confianza",
      "actualizaciones",
    ];
    const partes: string[] = [];
    for (const k of metricas) {
      const v = dato[k];
      if (typeof v === "string" && v.trim()) partes.push(`${k}: ${v}`);
      else if (typeof v === "number") partes.push(`${k}: ${v}`);
    }
    if (partes.length) return [partes.join(" · ")];
    return [JSON.stringify(obj)];
  }
  if (typeof obj === "string") {
    const texto = obj.trim();
    return texto ? [texto] : [];
  }
  if (typeof obj === "number" || typeof obj === "boolean") {
    return [String(obj)];
  }
  return [];
}

/** Convierte el `agentLesson` del servidor (string, JSON leído u objeto) en líneas. */
function descomponer(raw: unknown): string[] {
  if (typeof raw === "string") {
    const texto = raw.trim();
    if (!texto) return [];
    if (texto.startsWith("{") || texto.startsWith("[")) {
      try {
        return desdeObjeto(JSON.parse(texto));
      } catch {
        return [texto];
      }
    }
    return [texto];
  }
  return desdeObjeto(raw);
}

function leer(code: string): Entrada[] {
  if (typeof window === "undefined") return [];
  try {
    const crudo = sessionStorage.getItem(claveDiario(code));
    if (!crudo) return [];
    const datos = JSON.parse(crudo) as unknown;
    if (!Array.isArray(datos)) return [];
    return datos.filter(
      (e): e is Entrada =>
        !!e &&
        typeof e === "object" &&
        typeof (e as Entrada).texto === "string",
    );
  } catch {
    return [];
  }
}

function guardar(code: string, entradas: Entrada[]): void {
  try {
    sessionStorage.setItem(claveDiario(code), JSON.stringify(entradas));
  } catch {
    // sin almacenamiento el diario vive solo en memoria
  }
}

export function AgentDiary({
  code,
  lesson,
}: {
  code: string;
  lesson?: string;
}) {
  const [entradas, setEntradas] = useState<Entrada[]>(() => leer(code));
  const entradasRef = useRef<Entrada[]>(entradas);

  useEffect(() => {
    const nuevas = descomponer(lesson);
    if (nuevas.length === 0) return;
    let next = entradasRef.current;
    for (const texto of nuevas) {
      const ultima = next[next.length - 1];
      if (ultima && ultima.texto === texto) continue;
      next = [...next, { hora: horaAhora(), texto }];
    }
    if (next.length > MAX_ENTRADAS) next = next.slice(-MAX_ENTRADAS);
    if (next === entradasRef.current) return;
    entradasRef.current = next;
    guardar(code, next);
    setEntradas(next);
  }, [lesson, code]);

  const inverso = [...entradas].reverse();

  return (
    <section className="poker-panel diary-panel" aria-label="Diario del agente">
      <h2>📓 Diario del agente</h2>
      <p className="poker-muted">
        El agente empieza sin estrategia y aprende de cada mano.
      </p>
      {inverso.length === 0 ? (
        <p className="diary-vacio">
          Sin lecciones todavía: la primera aparecerá cuando juegue sus manos en
          esta sala.
        </p>
      ) : (
        <ol className="diary-lista">
          {inverso.map((e, i) => (
            <li className="diary-item" key={`${e.hora}-${i}`}>
              <span className="diary-hora">{e.hora}</span>
              <span className="diary-texto">{e.texto}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
