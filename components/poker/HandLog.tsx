"use client";

import { usePokerStore } from "../../store/usePokerStore";

export function HandLog() {
  const log = usePokerStore((s) => s.log);
  const visible = log.slice(-60);
  return (
    <section className="poker-panel" aria-label="Registro de la mano">
      <h2>Registro de mano</h2>
      {visible.length === 0 ? (
        <p className="poker-muted">Sin acciones todavía.</p>
      ) : (
        <ol className="poker-log">
          {visible.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ol>
      )}
    </section>
  );
}
