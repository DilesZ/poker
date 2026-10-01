import { codigoDe, respuestaEstado } from "@/lib/rooms/api";

export const dynamic = "force-dynamic";

interface Contexto {
  params: Promise<{ code: string }>;
}

export async function GET(request: Request, { params }: Contexto): Promise<Response> {
  const { code } = await params;
  return respuestaEstado(codigoDe(code), new URL(request.url));
}
