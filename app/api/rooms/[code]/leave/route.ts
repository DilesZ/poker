import { codigoDe, leerCuerpo, respuestaSalir } from "@/lib/rooms/api";

export const dynamic = "force-dynamic";

interface Contexto {
  params: Promise<{ code: string }>;
}

export async function POST(request: Request, { params }: Contexto): Promise<Response> {
  const { code } = await params;
  return respuestaSalir(codigoDe(code), await leerCuerpo(request));
}
