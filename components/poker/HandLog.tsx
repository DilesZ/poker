"use client";

import { useEffect, useRef } from "react";
import { usePokerStore } from "../../store/usePokerStore";

function logClass(line: string): string {
  const l = line.toLowerCase();
  if (
    l.includes("gana") ||
    l.includes("ganaste") ||
    l.includes("win") ||
    l.includes("🏆")
  ) {
    return "log-win";
  }
  if (l.includes("foldea") || l.includes("fold")) {
    return "log-fold";
  }
  if (
    l.includes("sube") ||
    l.includes("raise") ||
    l.includes("all-in") ||
    l.includes("allin")
  ) {
    return "log-raise";
  }
  if (
    l.includes("iguala") ||
    l.includes("call") ||
    l.includes("pasa") ||
    l.includes("check")
  ) {
    return "log-call";
  }
  return "";
}

export function HandLog() {
  const log = usePokerStore((s) => s.log);
  const visible = log.slice(-60);
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [visible.length]);

  return (
    <section className="poker-panel" aria-label="Registro de la mano">
      <h2>Registro de mano</h2>
      {visible.length === 0 ? (
        <p className="poker-muted">Sin acciones todavía.</p>
      ) : (
        <ol ref={listRef} className="poker-log" aria-live="polite">
          {visible.map((line, i) => {
            const cls = logClass(line);
            return (
              <li key={i}>
                {cls ? <span className={cls}>{line}</span> : line}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
