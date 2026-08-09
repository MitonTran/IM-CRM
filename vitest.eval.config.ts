import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["evals/**/*.eval.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 10_000,
    maxConcurrency: 1,
  },
  resolve: {
    alias: [
      { find: /^@\//, replacement: fileURLToPath(new URL("./src/", import.meta.url)) },
      { find: "server-only", replacement: fileURLToPath(new URL("./scripts/server-only-test-stub.mjs", import.meta.url)) },
    ],
  },
});
