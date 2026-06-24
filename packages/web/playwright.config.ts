import { defineConfig, devices } from "@playwright/test";
import { FAKE_HOST_PORT, WEB_PORT, WEB_URL } from "./e2e/fake-host/ports";

/**
 * Playwright drives the FULL desktop UI (app/src) as it runs in the browser
 * (packages/web), on the new TS engine adapter in control-plane mode, against an
 * in-memory fake host (e2e/fake-host) — no real backend, no AI provider.
 *
 * Two web servers boot for a run: the fake host (Bun) and vite with
 * `VITE_NEW_ENGINE=1`. The fake host is a single shared process, so the suite is
 * serial (`workers: 1`) and resets host state per test (see support/fixtures.ts).
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never" }]]
    : [["list"]],
  use: {
    baseURL: WEB_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "bun run e2e/fake-host/server.ts",
      port: FAKE_HOST_PORT,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      // VITE_NEW_ENGINE=1 aliases @houston-ai/engine-client → the new-engine
      // adapter and mounts NewEngineRoot (see packages/web/src/main.tsx).
      command: "pnpm dev",
      port: WEB_PORT,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 120_000,
      env: { VITE_NEW_ENGINE: "1" },
    },
  ],
});
