import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Preview studio: serves src/preview, plays songs live via the same engine.ts.
export default defineConfig({
  root: r("./src/preview"),
  esbuild: { jsx: "automatic", jsxImportSource: "codesong" },
  resolve: {
    alias: [
      // Order matters: the more specific aliases must come first.
      { find: "codesong/jsx-dev-runtime", replacement: r("./src/core/jsx-runtime.ts") },
      { find: "codesong/jsx-runtime", replacement: r("./src/core/jsx-runtime.ts") },
      { find: "codesong", replacement: r("./src/index.ts") },
    ],
  },
  server: { port: 5174, open: false },
});
