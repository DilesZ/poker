import { createBrain } from "@/lib/agent/brain";
import { loadGlobalBrainServer, mergeAndSaveServer } from "@/lib/agent/globalStore";

export const dynamic = "force-dynamic";

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
    if (hands > 20000) hands = 20000;
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
    if (brainNuevo && typeof brainNuevo === "object") {
      try {
        const merged = await mergeAndSaveServer(
          brainNuevo as Parameters<typeof mergeAndSaveServer>[0],
        );
        handsPlayed = merged.handsPlayed;
      } catch {
        const hp = (brainNuevo as { handsPlayed?: unknown }).handsPlayed;
        if (typeof hp === "number") handsPlayed = hp;
      }
    } else {
      const actual = await loadGlobalBrainServer();
      if (actual) handsPlayed = actual.handsPlayed;
    }

    return Response.json(
      { hands: handsHechas, winrateBB100, showdownPct, handsPlayed },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "error" },
      { headers: { "cache-control": "no-store" } },
    );
  }
}
