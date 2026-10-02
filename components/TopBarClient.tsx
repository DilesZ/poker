"use client";

import { usePathname } from "next/navigation";
import { TopBar } from "./TopBar";

export function TopBarClient() {
  const pathname = usePathname();
  const active = pathname === "/" ? "/" : pathname.startsWith("/salas") ? "/salas" : "/entrenar";
  return <TopBar active={active} />;
}
