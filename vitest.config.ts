import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const RAIZ = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    // Replica tsconfig paths "@/*" (Next/tsc lo resuelven, vite no).
    alias: [{ find: "@", replacement: RAIZ }],
  },
  test: {
    include: ["lib/**/*.test.ts", "scripts/**/*.test.ts", "store/**/*.test.ts"],
  },
});
