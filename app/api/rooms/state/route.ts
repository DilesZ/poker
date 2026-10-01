// Alias plano de GET /api/rooms/{code}: el código viaja en `?code=`.
import { codigoDe, respuestaEstado } from "@/lib/rooms/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  return respuestaEstado(codigoDe(url.searchParams.get("code")), url);
}
