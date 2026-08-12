import { defineConfig, devices } from "@playwright/test";

if (process.env.E2E_LOCAL_ONLY !== "true") throw new Error("E2E IM CRM chỉ chạy qua npm run test:e2e với Supabase local.");

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  preserveOutput: "always",
  timeout: 30_000,
  expect: { timeout: 8_000 },
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  use: {
    baseURL: "http://localhost:3200",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run start -- -p 3200",
    url: "http://127.0.0.1:3200/api/health",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
