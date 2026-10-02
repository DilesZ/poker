import { listExperiments } from "@/lib/experiments/store";

export const dynamic = "force-dynamic";

interface ExperimentoMeta {
  id: string;
  name: string;
  createdAt: string;
  algorithm: string;
  game: string;
  iterations: number;
  seed: number;
  exploitability: number;
  ckptVersion: string;
  evals: number;
}

export async function GET(): Promise<Response> {
  try {
    const experiments = listExperiments();
    const metas: ExperimentoMeta[] = experiments.map((e) => ({
      id: e.id,
      name: e.name,
      createdAt: e.createdAt,
      algorithm: e.algorithm,
      game: e.game,
      iterations: e.iterations,
      seed: e.seed,
      exploitability: e.checkpoint.exploitability,
      ckptVersion: e.checkpoint.version,
      evals: e.evaluations.length,
    }));
    return Response.json({ experiments: metas });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    return Response.json(
      { error: `Error al listar experimentos: ${mensaje}` },
      { status: 500 },
    );
  }
}
