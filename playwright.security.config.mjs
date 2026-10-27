import { defineConfig } from "@playwright/test";
import base from "./playwright.config.mjs";

export default defineConfig({
  ...base, testMatch: "guest-security.spec.mjs", outputDir: "test-results/guest-security",
  use: { ...base.use, baseURL: "http://localhost:3302" },
  webServer: {
    command: "node node_modules/next/dist/bin/next start --port 3302",
    url: "http://localhost:3302/login", reuseExistingServer: false, timeout: 60000,
    env: { SESSION_SECRET: "isolated-production-guest-security-test-secret-at-least-32-characters" },
  },
});
