import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for ACM KPI Pro e2e tests (Phase 04 / TEST-03).
 *
 * Runs serially (workers: 1) because the upload tests share a single
 * Postgres database and ingesting the LagBes fixture is a non-commutative
 * side-effect. The live stack must be up before running these tests — in
 * Phase 04 this is a manual `docker compose up` / `npm run dev` prerequisite;
 * Phase 08 will wire stack startup into a webServer config for CI.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5173",
    headless: true,
    screenshot: "only-on-failure",
    video: "off",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
