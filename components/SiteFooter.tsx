import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-brand">
          <span className="brand-mark" aria-hidden="true">
            ♠
          </span>
          Poker Coach
        </div>
        <nav aria-label="Pie de página">
          <Link href="/">Mesa 6-max</Link>
          <Link href="/salas">Salas privadas</Link>
          <Link href="/entrenar">Entrenar agente</Link>
        </nav>
        <p className="site-footer-legal">
          Herramienta educativa sin dinero real. El agente aprende jugando en este
          sitio; prohibido usar bots en salas externas. Juego responsable: +18.
        </p>
      </div>
    </footer>
  );
}
