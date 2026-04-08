import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // Use 'forks' pool to run each test file in a fresh Node.js subprocess.
    // This avoids the vitest vmThreads CJS module-cache issue where fastify's
    // circular require chains break when modules are cached across test runs.
    // Required on Node.js ≥ 23 where vmThreads module caching behavior changed.
    pool: "forks",
    // Setup file that pre-loads semver to fix circular dep issue on Node 25.
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      reporter: ["text", "lcov"],
    },
  },
});
