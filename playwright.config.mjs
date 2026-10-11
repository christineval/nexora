import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
const edge = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
export default defineConfig({
  testDir: "./tests", testMatch: "pages.spec.mjs", workers: 1,
  use: { baseURL: "http://localhost:3000", headless: true, launchOptions: existsSync(edge) ? { executablePath: edge } : {}, screenshot: "only-on-failure" },
  webServer: { command: (process.platform === "win32" ? "npm.cmd" : "npm") + " run dev", url: "http://localhost:3000/login", reuseExistingServer: true, timeout: 120000 },
});
