// Alias plano de POST /api/rooms/{code}/leave: el código va en el cuerpo.
import { codigoDe, leerCuerpo, respuestaSalir } from "@/lib/rooms/api";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const cuerpo = await leerCuerpo(request);
  return respuestaSalir(codigoDe(cuerpo?.code), cuerpo);
}
