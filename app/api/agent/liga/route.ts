import { createBrain } from "@/lib/agent/brain";
import { loadGlobalBrainServer, mergeAndSaveServer, saveGlobalBrainServer } from "@/lib/agent/globalStore";
import { recordTrainJob } from "@/lib/agent/jobs";

export const dynamic = "force-dynamic";

/** La liga es más cara (6 reflects/mano): tope conservador por petición. */
export const MAX_HANDS_LIGA = 500;

function redondear2(n: unknown): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

/** Núcleo compartido POST/GET: juega la liga y la fusiona al global. */
async function jugarYGuardar(hands: number, seed: number | undefined) {
  let mod: Record<string, unknown>;
  try {
    // @ts-ignore: liga on-policy; si no existe responde 501
    mod = (await import("@/lib/agent/liga")) as unknown as Record<string, unknown>;
  } catch {
    return { error: "liga no disponible aún", status: 501 } as const;
  }
  const fn = mod["jugarLiga"];
  if (typeof fn !== "function") {
    return { error: "liga no disponible aún", status: 501 } as const;
  }
  const base = (await loadGlobalBrainServer()) ?? createBrain();
  const baseHands = base.handsPlayed ?? 0;
  const f = fn as (...args: unknown[]) => unknown;
  const res = (await f(base, { hands, seed })) as {
    brain: Parameters<typeof mergeAndSaveServer>[0];
    stats: { hands: number; sumaBB: number; showdownPct: number; reflects: number; priorsMovidos: number };
  };
  const merged = await mergeAndSaveServer(res.brain);
  // La liga cuenta 1 mano por mano repartida (6 reflects internos): el merge
  // suma manos, así que se corrige a global+manos nuevas reales.
  merged.handsPlayed = baseHands + res.stats.hands;
  await saveGlobalBrainServer(merged);

  const ahora = Date.now();
  const jobId = `L-${ahora.toString(36)}-${Math.floor(Math.random() * 1296).toString(36)}`;
  try {
    await recordTrainJob({
      id: jobId,
      kind: "liga",
      status: "done",
      requested: hands,
      done: res.stats.hands,
      winrateBB100: 0,
      showdownPct: res.stats.showdownPct,
      handsPlayed: merged.handsPlayed,
      startedAt: ahora,
      updatedAt: ahora,
    });
  } catch {
    // best-effort
  }
  return {
    jobId,
    kind: "liga" as const,
    hands: res.stats.hands,
    reflects: res.stats.reflects,
    sumaBB: redondear2(res.stats.sumaBB),
    showdownPct: redondear2(res.stats.showdownPct),
    handsPlayed: merged.handsPlayed,
  };
}

function leerCuerpo(cuerpo: Record<string, unknown> | null) {
  const pedido = cuerpo?.["hands"];
  let hands = typeof pedido === "number" && Number.isFinite(pedido) ? Math.floor(pedido) : 500;
  if (hands < 1) hands = 500;
  if (hands > MAX_HANDS_LIGA) hands = MAX_HANDS_LIGA;
  const seedRaw = cuerpo?.["seed"];
  const seed = typeof seedRaw === "number" && Number.isFinite(seedRaw) ? Math.floor(seedRaw) : undefined;
  return { hands, seed };
}

export async function POST(request: Request): Promise<Response> {
  try {
    let cuerpo: Record<string, unknown> | null = {};
    try {
      const bruto: unknown = await request.json();
      cuerpo =
        bruto && typeof bruto === "object" && !Array.isArray(bruto)
          ? (bruto as Record<string, unknown>)
          : {};
    } catch {
      cuerpo = {};
    }
    const { hands, seed } = leerCuerpo(cuerpo);
    const r = await jugarYGuardar(hands, seed);
    if ("status" in r) {
      return Response.json({ error: r.error }, { status: r.status, headers: { "cache-control": "no-store" } });
    }
    return Response.json(r, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "error" },
      { headers: { "cache-control": "no-store" } },
    );
  }
}

/** GET (el cron de Vercel solo hace GET): ?hands=500 por defecto. */
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const q = url.searchParams.get("hands");
    const n = q !== null ? Number(q) : 500;
    const { hands } = leerCuerpo({ hands: Number.isFinite(n) ? n : 500 });
    const seedQ = url.searchParams.get("seed");
    const seedNum = seedQ !== null ? Number(seedQ) : Number.NaN;
    const r = await jugarYGuardar(hands, Number.isFinite(seedNum) ? seedNum : undefined);
    if ("status" in r) {
      return Response.json({ error: r.error }, { status: r.status, headers: { "cache-control": "no-store" } });
    }
    return Response.json(r, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "error" },
      { headers: { "cache-control": "no-store" } },
    );
  }
}
