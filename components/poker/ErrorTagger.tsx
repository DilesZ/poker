"use client";

import type { ErrorTag } from "../../lib/stats";
import { usePokerStore } from "../../store/usePokerStore";

const TAGS: Array<{ id: ErrorTag; label: string }> = [
  { id: "VPIP_ALTO", label: "VPIP alto" },
  { id: "SIN_POSICION", label: "Sin posición" },
  { id: "OVERBET", label: "Overbet" },
  { id: "CALL_SIN_ODDS", label: "Call sin odds" },
  { id: "TILT", label: "Tilt" },
  { id: "OTRO", label: "Otro" },
];

export function ErrorTagger() {
  const tagError = usePokerStore((s) => s.tagError);
  const errorTags = usePokerStore((s) => s.stats.errorTags);
  const count = (t: ErrorTag) => errorTags.filter((e) => e === t).length;

  return (
    <section className="poker-panel" aria-label="Etiquetar errores">
      <h2>Etiquetar error</h2>
      <div className="poker-tags">
        {TAGS.map((t) => (
          <button
            key={t.id}
            type="button"
            className="btn-ps btn-small"
            onClick={() => tagError(t.id)}
          >
            {t.label} ({count(t.id)})
          </button>
        ))}
      </div>
    </section>
  );
}
