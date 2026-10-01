"use client";

import { useEffect } from "react";
import { ActionBar } from "../components/poker/ActionBar";
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
      </header>
      <div className="poker-grid">
        <main>
          <PokerTable game={game} />
          <ActionBar />
        </main>
        <aside className="poker-sidebar">
          <HudBankroll />
          <ErrorTagger />
          <HandLog />
          <StrategyPanel />
        </aside>
      </div>
    </>
  );
}
