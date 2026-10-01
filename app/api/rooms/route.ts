import { crearSala, leerCuerpo } from "@/lib/rooms/api";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return crearSala(await leerCuerpo(request));
}
