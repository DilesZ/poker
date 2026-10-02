import Link from "next/link";

const LINKS = [
  { href: "/", label: "Mesa" },
  { href: "/salas", label: "Salas privadas" },
  { href: "/entrenar", label: "Entrenar" },
];

export function TopBar({ active }: { active: string }) {
  return (
    <div className="topbar">
      <div className="topbar-inner">
        <Link className="brand" href="/" aria-label="Poker Coach, inicio">
          <span className="brand-mark" aria-hidden="true">
            ♠
          </span>
          <span className="brand-name">
            Poker Coach
            <small>Texas Hold&apos;em · 6-max</small>
          </span>
        </Link>
        <nav className="topbar-nav" aria-label="Secciones">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={active === l.href ? "active" : ""}
              aria-current={active === l.href ? "page" : undefined}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <span className="live-dot" title="IA local + salas en servidor">
          IA en vivo
        </span>
      </div>
    </div>
  );
}
