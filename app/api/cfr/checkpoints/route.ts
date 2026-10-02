import { listCheckpoints } from "@/lib/lab/jobs";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const checkpoints = listCheckpoints();
    return Response.json({ checkpoints });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    return Response.json(
      { error: `Error al listar checkpoints: ${mensaje}` },
      { status: 500 },
    );
  }
}
