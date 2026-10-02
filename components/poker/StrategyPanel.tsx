"use client";
import { useState } from "react";
import { toCallFor, usePokerStore } from "@/store/usePokerStore";

const TABS = ["Manos iniciales", "Posición", "Pot odds"] as const;

export default function StrategyPanel() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Manos iniciales");
  const game = usePokerStore((s) => s.game);
  const pot = game?.pot ?? 0;
  const toCall = game ? toCallFor(game, 0) : 0;
  const odds = toCall > 0 ? (toCall / (pot + toCall)) * 100 : 0;

  return (
    <section className="poker-panel" aria-label="Estrategia">
      <h2>Estrategia</h2>
      <div className="poker-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={tab === t ? "active" : ""}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "Manos iniciales" && (
        <div className="poker-strategy">
          <ul>
            <li>
              <strong>Sube siempre:</strong> AA, KK, QQ, JJ, AKs, AKo.
            </li>
            <li>
              <strong>Sube en posición:</strong> TT–77, AQs–ATs, KQs, QJs, JTs,
              98s+.
            </li>
            <li>
              <strong>Foldea 6-max UTG:</strong> KTo, QTo, manos suited con gap
              grande, As débil.
            </li>
            <li>
              <strong>Pares pequeños:</strong> paga barato en multiway buscando
              set, foldea a 3-bet grande sin odds.
            </li>
          </ul>
        </div>
      )}
      {tab === "Posición" && (
        <div className="poker-strategy">
          <ul>
            <li>
              <strong>BTN/CO:</strong> abre ~40%/28%. Roba ciegas con rango
              amplio.
            </li>
            <li>
              <strong>SB/BB:</strong> defiende BB con 35%+ vs robo, 3-betea TT+,
              AQ+.
            </li>
            <li>
              <strong>Fuera de posición:</strong> apuesta más grande (70-100%
              pot), juega check-call con equity.
            </li>
            <li>
              <strong>Regla coach:</strong> si dudas fuera de posición, foldea.
              El error caro es pagar OOP.
            </li>
          </ul>
        </div>
      )}
      {tab === "Pot odds" && (
        <div className="poker-strategy">
          <p>
            Pot {pot} · A igualar {toCall} · Necesitas{" "}
            <strong>
              {toCall > 0 ? odds.toFixed(1) + "%" : "—"} de equity
            </strong>
            .
          </p>
          <p>Fórmula: call / (pot + call). Compara con tu equity estimada.</p>
          <ul>
            <li>Proyecto color (9 outs): ~18% flop→turn, ~36% flop→river.</li>
            <li>Escalera abierta (8 outs): ~16% / ~32%.</li>
            <li>
              Si tu equity &gt; odds → paga. Si no → fold (salvo outs
              implícitos claros).
            </li>
          </ul>
        </div>
      )}
    </section>
  );
}
