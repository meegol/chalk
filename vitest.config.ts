import { config } from "dotenv";
import path from "node:path";
import { defineConfig } from "vitest/config";

config({ quiet: true });

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "test/server-only-stub.ts"),
    },
  },
  test: {
    env: { DATABASE_URL: process.env.TEST_DATABASE_URL ?? "" },
    globalSetup: ["test/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
