import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { SiteFooter } from "../components/SiteFooter";
import { TopBarClient } from "../components/TopBarClient";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Poker Coach — Texas Hold'em 6-max vs IA",
    template: "%s — Poker Coach",
  },
  description:
    "Mesa 6-max estilo PokerStars para practicar Texas Hold'em contra IA con coach de pot odds, salas privadas y agente que aprende jugando.",
  icons: {
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='15' fill='%230a0f0d'/%3E%3Ccircle cx='16' cy='16' r='13.5' fill='none' stroke='%23e8b923' stroke-width='2'/%3E%3Ctext x='16' y='23' font-size='16' text-anchor='middle' fill='%23e8b923'%3E%E2%99%A0%3C/text%3E%3C/svg%3E",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0f0d",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>
        <a className="skip-link" href="#contenido">
          Saltar al contenido
        </a>
        <TopBarClient />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
