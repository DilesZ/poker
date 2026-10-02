import { createBrain } from "@/lib/agent/brain";
import { loadGlobalBrainServer } from "@/lib/agent/globalStore";
import { loadLatestEvalJob, recordEvalJob } from "@/lib/agent/jobs";

export const dynamic = "force-dynamic";

/** Límite por petición: evita timeouts de serverless (1000 manos ≈ 3-7s). */
export const MAX_HANDS_EVAL = 1500;

function redondear2(n: unknown): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

/** GET → última evaluación (solo mide, no modifica el cerebro). */
export async function GET(): Promise<Response> {
  try {
    const ultimo = await loadLatestEvalJob();
    return Response.json({ ultimo }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ ultimo: null }, { headers: { "cache-control": "no-store" } });
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    let cuerpo: Record<string, unknown> | null = null;
    try {
      const bruto: unknown = await request.json();
      cuerpo =
        bruto && typeof bruto === "object" && !Array.isArray(bruto)
          ? (bruto as Record<string, unknown>)
          : {};
    } catch {
      cuerpo = {};
    }
    const pedido = cuerpo?.["hands"];
    let hands = typeof pedido === "number" && Number.isFinite(pedido) ? Math.floor(pedido) : 1000;
    if (hands < 1) hands = 1000;
    if (hands > MAX_HANDS_EVAL) hands = MAX_HANDS_EVAL;
    const seedRaw = cuerpo?.["seed"];
    const seed = typeof seedRaw === "number" && Number.isFinite(seedRaw) ? Math.floor(seedRaw) : 42;

    let mod: Record<string, unknown>;
    try {
      // @ts-ignore: evaluate lo crea otro agente; si no existe responde 501
      mod = (await import("@/lib/agent/evaluate")) as unknown as Record<string, unknown>;
    } catch {
      return Response.json({ error: "evaluador no disponible aún" }, { status: 501 });
    }
    const fn = mod["runBrainEval"];
    if (typeof fn !== "function") {
      return Response.json({ error: "evaluador no disponible aún" }, { status: 501 });
    }

    const brain = (await loadGlobalBrainServer()) ?? createBrain();
    let resultado: unknown;
    try {
      const f = fn as (...args: unknown[]) => Promise<unknown>;
      resultado = await f(brain, { hands, seed });
    } catch (e) {
      const ahoraErr = Date.now();
      const jobIdErr = `E-${ahoraErr.toString(36)}-${Math.floor(Math.random() * 1296).toString(36)}`;
      try {
        await recordEvalJob({
          id: jobIdErr,
          status: "error",
          hands,
          bb100: 0,
          sd: 0,
          ci95: 0,
          showdownPct: 0,
          brainDecisions: 0,
          seed,
          error: e instanceof Error ? e.message : "fallo de evaluación",
          startedAt: ahoraErr,
          updatedAt: ahoraErr,
        });
      } catch {
        // best-effort
      }
      return Response.json(
        { error: e instanceof Error ? e.message : "fallo de evaluación" },
        { headers: { "cache-control": "no-store" } },
      );
    }

    // Acepta varias formas de resultado (defensivo ante la firma del otro agente).
    let bb100 = 0;
    let sd = 0;
    let ci95 = 0;
    let showdownPct = 0;
    let brainDecisions = 0;
    let handsHechas = hands;
    if (resultado && typeof resultado === "object" && !Array.isArray(resultado)) {
      const r = resultado as Record<string, unknown>;
      const pick = (...keys: string[]): number | null => {
        for (const k of keys) {
          const v = r[k];
          if (typeof v === "number" && Number.isFinite(v)) return v;
        }
        return null;
      };
      const h = pick("hands", "n", "manos");
      if (h !== null) handsHechas = Math.floor(h);
      const bb = pick("bb100", "bb_100", "winrateBB100", "winrate");
      if (bb !== null) bb100 = bb;
      const s = pick("sd", "std", "desviacion", "desv");
      if (s !== null) sd = s;
      const ci = pick("ci95", "ci", "intervalo", "margen");
      if (ci !== null) ci95 = ci;
      const sw = pick("showdownPct", "showdown", "showdownRate");
      if (sw !== null) showdownPct = sw;
      const bd = pick("brainDecisions", "decisiones", "decisions");
      if (bd !== null) brainDecisions = Math.floor(bd);
    }

    bb100 = redondear2(bb100);
    sd = redondear2(sd);
    ci95 = redondear2(ci95);
    showdownPct = redondear2(showdownPct);

    const ahora = Date.now();
    const jobId = `E-${ahora.toString(36)}-${Math.floor(Math.random() * 1296).toString(36)}`;
    try {
      await recordEvalJob({
        id: jobId,
        status: "done",
        hands: handsHechas,
        bb100,
        sd,
        ci95,
        showdownPct,
        brainDecisions,
        seed,
        startedAt: ahora,
        updatedAt: ahora,
      });
    } catch {
      // best-effort
    }

    // Solo mide: NO modifica el cerebro.
    return Response.json(
      { hands: handsHechas, bb100, sd, ci95, showdownPct, brainDecisions },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "error" },
      { headers: { "cache-control": "no-store" } },
    );
  }
}
