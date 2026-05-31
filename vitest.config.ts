import { defineConfig } from "vitest/config";

// Separate from vite.config.ts (which sets the preview app root) so tests run
// from the repo root and discover src/**/*.test.ts.
export default defineConfig({
  test: {
    root: ".",
    include: ["src/**/*.test.ts"],
    testTimeout: 30000,
  },
});
