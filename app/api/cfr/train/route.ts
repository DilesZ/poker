import { TRAIN_CAPS, quickTrain } from "@/lib/lab/jobs";
import type { QuickTrainRequest } from "@/lib/lab/jobs";

export const dynamic = "force-dynamic";

const JUEGOS_VALIDOS = ["kuhn", "leduc", "holdem-hu-preflop"] as const;
const ALGORITMOS_VALIDOS = ["cfr", "cfr+"] as const;

type JuegoValido = (typeof JUEGOS_VALIDOS)[number];
type AlgoritmoValido = (typeof ALGORITMOS_VALIDOS)[number];

function esJuegoValido(v: unknown): v is JuegoValido {
  return (
    typeof v === "string" &&
    (JUEGOS_VALIDOS as readonly string[]).includes(v)
  );
}

function esAlgoritmoValido(v: unknown): v is AlgoritmoValido {
  return (
    typeof v === "string" &&
    (ALGORITMOS_VALIDOS as readonly string[]).includes(v)
  );
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
  const { game, algorithm, iterations, seed, population } = b;

  if (!esJuegoValido(game)) {
    return Response.json(
      {
        error:
          "Campo 'game' inválido o ausente: debe ser 'kuhn', 'leduc' o 'holdem-hu-preflop'.",
      },
      { status: 400 },
    );
  }

  if (!esAlgoritmoValido(algorithm)) {
    return Response.json(
      {
        error:
          "Campo 'algorithm' inválido o ausente: debe ser 'cfr' o 'cfr+'.",
      },
      { status: 400 },
    );
  }

  if (
    typeof iterations !== "number" ||
    !Number.isInteger(iterations) ||
    iterations <= 0
  ) {
    return Response.json(
      {
        error:
          "Campo 'iterations' inválido o ausente: debe ser un entero mayor que 0.",
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

  const tope = (TRAIN_CAPS as Record<string, number>)[game];
  if (typeof tope === "number" && iterations > tope) {
    return Response.json(
      {
        error: `Iteraciones (${iterations}) exceden el límite para '${game}' (máximo ${tope}).`,
      },
      { status: 400 },
    );
  }

  const req: QuickTrainRequest = {
    game,
    algorithm,
    iterations,
    seed,
    ...(population !== undefined
      ? { population: population as QuickTrainRequest["population"] }
      : {}),
  };

  try {
    const resultado = await quickTrain(req);
    return Response.json(resultado);
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    if (esErrorDeCaps(mensaje)) {
      return Response.json({ error: mensaje }, { status: 400 });
    }
    return Response.json(
      { error: `Error al entrenar: ${mensaje}` },
      { status: 500 },
    );
  }
}
