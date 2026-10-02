// Daemon local de liga: juega sin el usuario y sube el cerebro a prod.
// Uso: npm run liga -- [url] [iteraciones] [manos]
//   npm run liga -- https://poker-flax-seven.vercel.app 10 2000
// Cada iteración: jugarLiga local (rápido, sin timeouts) + POST /api/agent/brain
// (el servidor fusiona). Ctrl+C para parar; lo jugado queda guardado.
import { createBrain, type Brain } from "../lib/agent/brain";
import { jugarLiga } from "../lib/agent/liga";

const PROD = process.argv[2] ?? "https://poker-flax-seven.vercel.app";
const ITERACIONES = Number.parseInt(process.argv[3] ?? "10", 10);
const MANOS = Number.parseInt(process.argv[4] ?? "2000", 10);

async function cargar(): Promise<Brain> {
  try {
    const res = await fetch(`${PROD}/api/agent/brain?full=0`, { cache: "no-store" });
    if (!res.ok) return createBrain();
    // El resumen no trae priors: parte de cero y el servidor fusiona al subir.
    return createBrain();
  } catch {
    return createBrain();
  }
}

async function subir(brain: Brain): Promise<string> {
  const res = await fetch(`${PROD}/api/agent/brain`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ brain }),
  });
  const data = (await res.json()) as { handsPlayed?: number; priorsAprendidos?: number };
  return `manos=${data.handsPlayed ?? "?"} priors=${data.priorsAprendidos ?? "?"}`;
}

async function main(): Promise<void> {
  console.log(`liga local → ${PROD} · ${ITERACIONES}x${MANOS} manos`);
  let base = await cargar();
  for (let i = 0; i < ITERACIONES; i++) {
    const t0 = Date.now();
    const r = jugarLiga(base, { hands: MANOS, seed: (Date.now() ^ (i * 7919)) >>> 0 });
    base = r.brain;
    const estado = await subir(base);
    console.log(
      `[${i + 1}/${ITERACIONES}] manos=${r.stats.hands} reflects=${r.stats.reflects} ` +
        `sumaBB=${r.stats.sumaBB} showdown=${(r.stats.showdownPct * 100).toFixed(0)}% ` +
        `${((Date.now() - t0) / 1000).toFixed(1)}s → ${estado}`,
    );
  }
  console.log("liga terminada.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
