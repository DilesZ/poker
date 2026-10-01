import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Poker Coach — Texas Hold'em vs IA",
  description:
    "Mesa 6-max estilo PokerStars para practicar Texas Hold'em contra IA, con coach de pot odds y registro de errores.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
