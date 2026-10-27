import { config } from "dotenv";
import path from "node:path";
import { defineConfig } from "vitest/config";

config({ quiet: true });

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "server-only": path.resolve(import.meta.dirname, "test/server-only-stub.ts"),
    },
  },
  test: {
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "",
      STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY ?? "sk_test_placeholder",
      STRIPE_WEBHOOK_SECRET: "whsec_test_secret",
    },
    globalSetup: ["test/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
