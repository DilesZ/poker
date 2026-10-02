import { loadGlobalBrainServer, mergeAndSaveServer } from "@/lib/agent/globalStore";
import type { Brain } from "@/lib/agent/brain";

export const dynamic = "force-dynamic";

function resumen(brain: Brain | null) {
  if (!brain) {
    return {
      handsPlayed: 0,
      epsilon: 0.9,
      lessonsCount: 0,
      winrate: 0,
      priorsAprendidos: 0,
      updatedAt: null as number | null,
      avgDeltaBB100: 0,
      manosConDelta: 0,
    };
  }
  const lessons = brain.lessons ?? [];
  const victorias = lessons.filter((l) => l.outcome === "victoria").length;
  const winrate = lessons.length > 0 ? victorias / lessons.length : 0;
  // EV real: media de stackDelta de las lecciones con datos, en bb/100 (bb=20).
  // El winrate de lecciones engaña (la mayoría de manos pierde las ciegas por
  // diseño); el EV dice si el juego gana fichas.
  const deltas = lessons
    .map((l) => (l as { stackDelta?: unknown }).stackDelta)
    .filter((d): d is number => typeof d === "number" && Number.isFinite(d));
  const avgDeltaBB100 =
    deltas.length > 0 ? (deltas.reduce((a, b) => a + b, 0) / deltas.length) * 5 : 0;
  const priors = brain.priors ?? {};
  let aprendidos = 0;
  for (const v of Object.values(priors)) {
    if (typeof v === "number" && v !== 0.5) aprendidos++;
  }
  const raw = brain as unknown as Record<string, unknown>;
  const u = raw["updatedAt"];
  const updatedAt = typeof u === "number" && Number.isFinite(u) ? u : null;
  return {
    handsPlayed: brain.handsPlayed ?? 0,
    epsilon: brain.epsilon ?? 0.9,
    lessonsCount: lessons.length,
    winrate,
    priorsAprendidos: aprendidos,
    updatedAt,
    avgDeltaBB100: Math.round(avgDeltaBB100 * 100) / 100,
    manosConDelta: deltas.length,
  };
}

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const full = url.searchParams.get("full") === "1";
    const brain = await loadGlobalBrainServer();
    const base = resumen(brain);
    if (!full) return Response.json(base, { headers: { "cache-control": "no-store" } });
    return Response.json(
      {
        ...base,
        priors: brain?.priors ?? {},
        lessons: (brain?.lessons ?? []).slice(-10),
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    return Response.json(
      { handsPlayed: 0, epsilon: 0.9, lessonsCount: 0, winrate: 0, priorsAprendidos: 0, updatedAt: null, avgDeltaBB100: 0, manosConDelta: 0, error: e instanceof Error ? e.message : "error" },
      { headers: { "cache-control": "no-store" } },
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    let cuerpo: unknown = null;
    try {
      cuerpo = await request.json();
    } catch {
      cuerpo = null;
    }
    const subido =
      cuerpo && typeof cuerpo === "object" && !Array.isArray(cuerpo)
        ? (cuerpo as Record<string, unknown>).brain
        : null;
    if (subido && typeof subido === "object" && !Array.isArray(subido)) {
      const merged = await mergeAndSaveServer(subido as Brain);
      return Response.json(resumen(merged), { headers: { "cache-control": "no-store" } });
    }
    const brain = await loadGlobalBrainServer();
    return Response.json(resumen(brain), { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return Response.json(
      { handsPlayed: 0, epsilon: 0.9, lessonsCount: 0, winrate: 0, priorsAprendidos: 0, updatedAt: null, avgDeltaBB100: 0, manosConDelta: 0, error: e instanceof Error ? e.message : "error" },
      { headers: { "cache-control": "no-store" } },
    );
  }
}
