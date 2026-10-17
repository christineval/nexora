import { defineConfig } from "@playwright/test";
import base from "./playwright.config.mjs";

export default defineConfig({
  ...base,
  testMatch: "guest-offline.spec.mjs",
  outputDir: "test-results/guest-offline",
  use: { ...base.use, baseURL: "http://localhost:3301" },
  webServer: {
    command: "node node_modules/next/dist/bin/next start --port 3301",
    url: "http://localhost:3301/login", reuseExistingServer: false, timeout: 60000,
    env: {
      DATABASE_URL: "postgresql://unavailable:unavailable@127.0.0.1:9/no_guest_database?connect_timeout=1",
      SESSION_SECRET: "guest-offline-test-signing-secret-at-least-32-characters",
    },
  },
});
