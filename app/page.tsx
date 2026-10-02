"use client";

import Link from "next/link";
import { useEffect } from "react";
import { ActionBar } from "../components/poker/ActionBar";
import { CoachPanel } from "../components/coach/CoachPanel";
import { CoachFeedback } from "../components/poker/CoachFeedback";
import { ErrorTagger } from "../components/poker/ErrorTagger";
import { HandLog } from "../components/poker/HandLog";
import { HudBankroll } from "../components/poker/HudBankroll";
import { PokerTable } from "../components/poker/PokerTable";
import StrategyPanel from "../components/poker/StrategyPanel";
import { usePokerStore } from "../store/usePokerStore";

export default function HomePage() {
  const game = usePokerStore((s) => s.game);
  const hydrateStats = usePokerStore((s) => s.hydrateStats);

  useEffect(() => {
    hydrateStats();
  }, [hydrateStats]);

  return (
    <>
      <header className="poker-header">
        <span className="poker-eyebrow">Coach + IA que aprende</span>
        <h1>
          Texas Hold&apos;em <span className="gold">6-max</span> contra la máquina
        </h1>
        <p>
          Mesa estilo PokerStars con coach de pot odds en vivo, registro de errores
          y un agente que aprende de cada mano que juegas.
        </p>
        <nav className="poker-nav" aria-label="Acciones principales">
          <Link className="btn-ps btn-new" href="/salas">
            Jugar en sala privada
          </Link>
          <Link className="btn-ps btn-call" href="/entrenar">
            Entrenar al agente
          </Link>
        </nav>
      </header>
      <div className="poker-grid">
        <main id="contenido" aria-label="Mesa de poker">
          <PokerTable game={game} />
          <ActionBar />
        </main>
        <aside className="poker-sidebar" aria-label="Panel coach">
          <HudBankroll />
          <CoachFeedback />
          <ErrorTagger />
          <HandLog />
          <StrategyPanel />
          <CoachPanel />
        </aside>
      </div>
    </>
  );
}
