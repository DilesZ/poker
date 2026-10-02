import { BENCH_CAPS, runLabBenchmark } from "@/lib/lab/benchmark";
import type { LabBenchmarkRequest } from "@/lib/lab/benchmark";

export const dynamic = "force-dynamic";

function esLadoValido(lado: unknown): boolean {
  if (typeof lado !== "object" || lado === null) return false;
  const l = lado as Record<string, unknown>;
  if (l["kind"] === "baseline") {
    return typeof l["id"] === "string" && (l["id"] as string).length > 0;
  }
  if (l["kind"] === "ckpt") {
    return (
      typeof l["path"] === "string" && (l["path"] as string).length > 0
    );
  }
  return false;
}

function esErrorDeCaps(mensaje: string): boolean {
  const m = mensaje.toLowerCase();
  return (
    m.includes("límite") ||
    m.includes("limite") ||
    m.includes("excede") ||
    m.includes("exceden") ||
    m.includes("máximo") ||
    m.includes("maximo") ||
    m.includes("cap")
  );
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Cuerpo JSON inválido." },
      { status: 400 },
    );
  }

  if (typeof body !== "object" || body === null) {
    return Response.json(
      { error: "Cuerpo JSON inválido: se esperaba un objeto." },
      { status: 400 },
    );
  }

  const b = body as Record<string, unknown>;
  const { a, hands, seed } = b;
  const c = b as { b?: unknown };
  const ladoB: unknown = c.b;

  if (!esLadoValido(a)) {
    return Response.json(
      {
        error:
          "Campo 'a' inválido o ausente: debe ser { kind: 'baseline', id } o { kind: 'ckpt', path }.",
      },
      { status: 400 },
    );
  }

  if (!esLadoValido(ladoB)) {
    return Response.json(
      {
        error:
          "Campo 'b' inválido o ausente: debe ser { kind: 'baseline', id } o { kind: 'ckpt', path }.",
      },
      { status: 400 },
    );
  }

  if (
    typeof hands !== "number" ||
    !Number.isInteger(hands) ||
    hands <= 0
  ) {
    return Response.json(
      {
        error:
          "Campo 'hands' inválido o ausente: debe ser un entero mayor que 0.",
      },
      { status: 400 },
    );
  }

  if (typeof seed !== "number" || !Number.isInteger(seed)) {
    return Response.json(
      {
        error:
          "Campo 'seed' inválido o ausente: debe ser un número entero.",
      },
      { status: 400 },
    );
  }

  const maxHands = (BENCH_CAPS as { maxHands: number }).maxHands;
  if (typeof maxHands === "number" && hands > maxHands) {
    return Response.json(
      {
        error: `Manos (${hands}) exceden el límite (máximo ${maxHands}).`,
      },
      { status: 400 },
    );
  }

  const req = body as LabBenchmarkRequest;

  try {
    const { result, missesA, missesB, fallbacksA, fallbacksB } =
      await runLabBenchmark(req);
    return Response.json({ result, missesA, missesB, fallbacksA, fallbacksB });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    if (esErrorDeCaps(mensaje)) {
      return Response.json({ error: mensaje }, { status: 400 });
    }
    return Response.json(
      { error: `Error al evaluar: ${mensaje}` },
      { status: 500 },
    );
  }
}
