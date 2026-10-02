import { loadExperiment } from "@/lib/experiments/store";

export const dynamic = "force-dynamic";

/**
 * GET /api/cfr/experiments/[id] → { experiment } completo.
 * Existe para que el cliente pueda comparar A vs B con compareExperiments
 * (puro, en @/lib/experiments/compare) sin importar node:fs en el bundle.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    if (!id || id.includes("/") || id.includes("\\") || id.includes("..")) {
      return Response.json({ error: `Id de experimento inválido: "${id}".` }, { status: 400 });
    }
    const experiment = loadExperiment(`experiments/${id}.json`);
    return Response.json({ experiment });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    return Response.json({ error: `Error al cargar el experimento: ${mensaje}` }, { status: 404 });
  }
}
