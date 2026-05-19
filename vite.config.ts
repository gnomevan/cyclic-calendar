import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Vite serves the UI from `ui/` and pulls the core library directly from
 * `src/` — no separate build step for the lib. This works because the lib
 * is ESM-only TypeScript with no native dependencies on its browser-safe
 * surface (see `src/index.ts`'s comment about persistence). The SQLite
 * repository lives in `src/sqlite.ts` and is deliberately NOT exposed via
 * the barrel; the UI must never import it. If you find yourself wanting
 * persistence in the browser, that is Step 3.b — a small wasm-SQLite or
 * IndexedDB shim — not a change here.
 */
export default defineConfig({
  plugins: [react()],
  root: "ui",
  build: {
    outDir: "../dist-ui",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
  },
});
