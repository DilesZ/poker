"use client";

import Link from "next/link";
import { useEffect } from "react";
import { ActionBar } from "../components/poker/ActionBar";
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
        <h1>♠ Poker Coach · 6-max vs IA</h1>
        <p>Texas Hold&apos;em estilo PokerStars con coach integrado.</p>
        <nav className="poker-nav" aria-label="Navegación principal">
          <Link className="btn-ps btn-call" href="/salas">
            Jugar en sala privada con amigos
          </Link>
          <Link className="btn-ps btn-small" href="/entrenar">
            Entrenar agente
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
        </aside>
      </div>
    </>
  );
}
