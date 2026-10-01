// Alias plano de POST /api/rooms/{code}/action: el código va en el cuerpo.
import { codigoDe, leerCuerpo, respuestaAccion } from "@/lib/rooms/api";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const cuerpo = await leerCuerpo(request);
  return respuestaAccion(codigoDe(cuerpo?.code), cuerpo);
}
