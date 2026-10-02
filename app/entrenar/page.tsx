import Link from "next/link";
import GlobalBrainPanel from "@/components/agent/GlobalBrainPanel";
import SelfPlayPanel from "@/components/training/SelfPlayPanel";
import TournamentBar from "@/components/tournament/TournamentBar";
import LabSection from "@/components/lab/LabSection";

export const metadata = {
  title: "Entrenar — Poker Coach",
  description:
    "Self-play local y torneo SNG demo: entrena la IA contra sí misma sin dinero real.",
};

export default function EntrenarPage() {
  return (
    <>
      <header className="poker-header">
        <span className="poker-eyebrow">Laboratorio del agente</span>
        <h1>
          Entrenar <span className="gold">y torneo</span>
        </h1>
        <p>
          Self-play local y SNG de demostración.{" "}
          <Link href="/">← Volver a la mesa</Link>
        </p>
      </header>
      <div className="poker-grid">
        <main className="poker-sidebar">
          <GlobalBrainPanel />
          <SelfPlayPanel />
          <TournamentBar />
        </main>
        <aside className="poker-sidebar">
          <section className="poker-panel" aria-label="Qué aprende v0.2">
            <h2>📖 Qué aprende v0.2 (honesto)</h2>
            <div className="poker-strategy">
              <ul>
                <li>
                  Update por <strong>regret simple</strong> (LR 0.05) sobre
                  la clase de mano del héroe, más umbrales push/fold por
                  posición y sizings 33/50/75% del bote.
                </li>
                <li>
                  Detección de varianza: con la misma estrategia en los 6
                  asientos, el winrate esperado es ≈ 0 bb/100.
                </li>
                <li>
                  <strong>Qué NO es:</strong> no es GTO. Sin rangos
                  balanceados, sin sizes mixtos, sin adaptación al rival y
                  sin memoria entre manos (una decisión simplificada por
                  calle).
                </li>
                <li>
                  <strong>Servidor:</strong> el cerebro global vive en KV
                  (clave <code>agent:global:brain:v3</code>, TTL 30 días) y
                  se comparte entre PCs; cada sala hidrata desde él y
                  fusiona al cerrar manos (best-effort, sin bloquear).
                </li>
              </ul>
            </div>
          </section>
          <section className="poker-panel" aria-label="Límites legales">
            <h2>⚖️ Límites legales</h2>
            <div className="poker-strategy">
              <ul>
                <li>Solo self-play local en tu navegador. Sin dinero real.</li>
                <li>
                  Prohibido usar bots en salas externas (viola sus términos
                  y puede ser ilegal según tu jurisdicción).
                </li>
                <li>Herramienta educativa. Juego responsable: +18.</li>
              </ul>
            </div>
          </section>
        </aside>
      </div>
      <LabSection />
    </>
  );
}
