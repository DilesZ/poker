import { createBrain } from "@/lib/agent/brain";
import {
  loadGlobalBrainServer,
  mergeAndSaveServer,
  saveGlobalBrainServer,
} from "@/lib/agent/globalStore";
import { loadLatestTrainJob, recordTrainJob } from "@/lib/agent/jobs";

export const dynamic = "force-dynamic";

/** Límite por petición: evita timeouts de serverless (1000 manos ≈ 3-7s). */
export const MAX_HANDS_POR_PETICION = 1500;

/** GET → último entrenamiento terminado (para saber cuándo acabó). */
export async function GET(): Promise<Response> {
  try {
    const ultimo = await loadLatestTrainJob();
    if (!ultimo) {
      return Response.json(
        { entrenamientos: 0, ultimo: null },
        { headers: { "cache-control": "no-store" } },
      );
    }
    return Response.json(
      { entrenamientos: 1, ultimo },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return Response.json(
      { entrenamientos: 0, ultimo: null },
      { headers: { "cache-control": "no-store" } },
    );
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
    // Cap por petición (el panel reanuda en trozos hasta el objetivo).
    let recorte = false;
    if (hands > MAX_HANDS_POR_PETICION) {
      hands = MAX_HANDS_POR_PETICION;
      recorte = true;
    }
    const pedidoTotal = cuerpo?.["total"];
    const total =
      typeof pedidoTotal === "number" && Number.isFinite(pedidoTotal)
        ? Math.floor(pedidoTotal)
        : hands;
    const seedRaw = cuerpo?.["seed"];
    const seed = typeof seedRaw === "number" && Number.isFinite(seedRaw) ? Math.floor(seedRaw) : undefined;

    let mod: Record<string, unknown>;
    try {
      // @ts-ignore: el trainer lo crea otro agente; si no existe responde 501
      mod = (await import("@/lib/agent/trainer")) as unknown as Record<string, unknown>;
    } catch {
      return Response.json({ error: "trainer no disponible aún" }, { status: 501 });
    }
    const fn = mod["trainBatch"];
    if (typeof fn !== "function") {
      return Response.json({ error: "trainer no disponible aún" }, { status: 501 });
    }

    const base = (await loadGlobalBrainServer()) ?? createBrain();
    const baseHands = base.handsPlayed ?? 0;
    let entrenado: unknown;
    try {
      const f = fn as (...args: unknown[]) => Promise<unknown>;
      // Firma real: trainBatch(brain, { hands, seed }). Compat: trainBatch({ hands, seed }).
      try {
        entrenado = await f(base, { hands, seed });
      } catch {
        entrenado = await f({ hands, seed });
      }
    } catch (e) {
      return Response.json(
        { error: e instanceof Error ? e.message : "fallo de entrenamiento" },
        { headers: { "cache-control": "no-store" } },
      );
    }

    let brainNuevo: unknown = null;
    let winrateBB100 = 0;
    let showdownPct = 0;
    let handsHechas = hands;
    if (entrenado && typeof entrenado === "object" && !Array.isArray(entrenado)) {
      const r = entrenado as Record<string, unknown>;
      if (r["brain"] && typeof r["brain"] === "object") {
        brainNuevo = r["brain"];
        const stats = r["stats"] as Record<string, unknown> | undefined;
        if (stats && typeof stats === "object") {
          if (typeof stats["winrateBB100"] === "number") winrateBB100 = stats["winrateBB100"] as number;
          else if (typeof stats["winrate"] === "number") winrateBB100 = stats["winrate"] as number;
          if (typeof stats["showdownPct"] === "number") showdownPct = stats["showdownPct"] as number;
          else if (typeof stats["showdown"] === "number") showdownPct = stats["showdown"] as number;
          if (typeof stats["hands"] === "number") handsHechas = stats["hands"] as number;
        } else {
          if (typeof r["winrateBB100"] === "number") winrateBB100 = r["winrateBB100"] as number;
          if (typeof r["showdownPct"] === "number") showdownPct = r["showdownPct"] as number;
          if (typeof r["hands"] === "number") handsHechas = r["hands"] as number;
        }
      } else if ("priors" in r && "handsPlayed" in r) {
        brainNuevo = r;
      }
    }

    let handsPlayed = handsHechas;
    let priorsMovidos: number | undefined;
    if (entrenado && typeof entrenado === "object" && !Array.isArray(entrenado)) {
      const stats = (entrenado as Record<string, unknown>)["stats"];
      if (stats && typeof stats === "object" && !Array.isArray(stats)) {
        const pm = (stats as Record<string, unknown>)["priorsMovidos"];
        if (typeof pm === "number") priorsMovidos = pm;
      }
    }
    if (brainNuevo && typeof brainNuevo === "object") {
      try {
        const merged = await mergeAndSaveServer(
          brainNuevo as Parameters<typeof mergeAndSaveServer>[0],
        );
        // merge suma manos (global+sala): corrige a global+manos nuevas reales.
        merged.handsPlayed = baseHands + handsHechas;
        await saveGlobalBrainServer(merged);
        handsPlayed = merged.handsPlayed;
      } catch {
        const hp = (brainNuevo as { handsPlayed?: unknown }).handsPlayed;
        if (typeof hp === "number") handsPlayed = hp;
      }
    } else {
      const actual = await loadGlobalBrainServer();
      if (actual) handsPlayed = actual.handsPlayed;
    }

    const jobId = `T-${Date.now().toString(36)}-${Math.floor(Math.random() * 1296).toString(36)}`;
    const ahora = Date.now();
    try {
      const { recordTrainJob } = await import("@/lib/agent/jobs");
      await recordTrainJob({
        id: jobId,
        status: "done",
        requested: total,
        done: handsHechas,
        winrateBB100,
        showdownPct,
        handsPlayed,
        ...(priorsMovidos !== undefined ? { priorsMovidos } : {}),
        startedAt: ahora,
        updatedAt: ahora,
      });
    } catch {
      // best-effort
    }

    return Response.json(
      { jobId, hands: handsHechas, winrateBB100, showdownPct, handsPlayed, recorte },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "error" },
      { headers: { "cache-control": "no-store" } },
    );
  }
}
