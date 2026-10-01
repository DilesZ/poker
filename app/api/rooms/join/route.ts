import { leerCuerpo, unirseSala } from "@/lib/rooms/api";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return unirseSala(await leerCuerpo(request));
}
