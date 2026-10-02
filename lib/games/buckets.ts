// Carga Node (fs) de la tabla EV preflop. Los datos puros (buckets,
// validación) viven en buckets-data.ts, importable desde el cliente sin
// node:fs. Este módulo es solo-Node (scripts/train, eval, API routes).
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validaEv, type PreflopEvFile } from "./buckets-data";

export { BUCKETS, TOTAL_COMBOS, bucketOf, validaEv } from "./buckets-data";
export type { BucketDef, PreflopEvFile } from "./buckets-data";

function candidatasJson(): string[] {
  const junto = join(dirname(fileURLToPath(import.meta.url)), "preflop-ev.json");
  return [junto, join(process.cwd(), "lib", "games", "preflop-ev.json")];
}

function leeFicheroEv(): PreflopEvFile {
  const ruta = candidatasJson().find((c) => existsSync(c));
  if (!ruta) {
    throw new Error(
      "Falta lib/games/preflop-ev.json. ejecuta npm run compute-ev para generarla.",
    );
  }
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(ruta, "utf8")) as unknown;
  } catch {
    throw new Error(
      `preflop-ev.json ilegible en ${ruta}. ejecuta npm run compute-ev para regenerarla.`,
    );
  }
  return validaEv(json);
}

/** Lee lib/games/preflop-ev.json y devuelve la matriz EV 12×12 validada. */
export function loadEvTable(): number[][] {
  return leeFicheroEv().ev;
}

/** Lee lib/games/preflop-ev.json y devuelve la matriz de empates 12×12. */
export function loadEvTie(): number[][] {
  return leeFicheroEv().tie;
}
