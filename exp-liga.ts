// Experimento: virgen -> 20k manos de liga on-policy -> eval tight multi-seed.
import { createBrain } from "./lib/agent/brain";
import { jugarLiga } from "./lib/agent/liga";
import { runBrainEval } from "./lib/agent/evaluate";

let base = createBrain();
for (let i = 0; i < 10; i++) {
  const t0 = Date.now();
  const r = jugarLiga(base, { hands: 2000, seed: 1000 + i });
  base = r.brain;
  console.log(
    `liga ${(i + 1) * 2000}/20000 manos=${r.brain.handsPlayed} eps=${r.brain.epsilon} ` +
      `showdown=${(r.stats.showdownPct * 100).toFixed(0)}% ${((Date.now() - t0) / 1000).toFixed(1)}s`,
  );
}
let s = 0;
let s2 = 0;
const seeds = [1, 7, 42, 99, 12345];
for (const seed of seeds) {
  const e = runBrainEval(base, { hands: 2000, seed, field: "tight" });
  s += e.bb100;
  s2 += e.bb100 * e.bb100;
  console.log(`eval seed ${seed}: bb100=${e.bb100.toFixed(1)} showdown=${(e.showdownPct * 100).toFixed(0)}%`);
}
const mean = s / seeds.length;
const sd = Math.sqrt(Math.max(0, s2 / seeds.length - mean * mean));
console.log(`FINAL 10k eval: media=${mean.toFixed(1)} IC95=±${((1.96 * sd) / Math.sqrt(seeds.length)).toFixed(1)}`);
