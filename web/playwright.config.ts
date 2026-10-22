import { defineConfig } from "@playwright/test";
export default defineConfig({
  globalSetup: "./e2e/setup.ts",
  testDir: "./e2e",
  timeout: 60000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: process.env.BASE_URL || "http://localhost:5173",
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  reporter: [["list"], ["html", { open: "never" }]],
});
