import { FAKE_HOST_PORT } from "@houston/fake-host";
import { defineConfig, devices } from "@playwright/test";
import {
  AUTH_WEB_PORT,
  AUTH_WEB_URL,
  FAKE_FIREBASE_API_KEY,
  WEB_PORT,
  WEB_URL,
} from "./e2e/config";

/**
 * Playwright drives the FULL desktop UI (app/src) as it runs in the browser
 * (packages/web), on the host adapter in host mode, against an
 * in-memory fake host (@houston/fake-host) — no real backend, no AI provider.
 *
 * Two web servers boot for a run: the fake host (Node) and vite. The fake
 * host is a single shared process, so the suite is serial (`workers: 1`) and
 * resets host state per test (see support/fixtures.ts).
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  // Warm the vite dev server before the timed suite so the first test doesn't
  // pay vite's cold on-demand compile inside its assertion budget (see
  // e2e/support/global-setup.ts).
  globalSetup: "./e2e/support/global-setup.ts",
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
  projects: [
    {
      // The identity-OFF server (no baked Firebase key): the whole suite boots
      // straight to the shell. Excludes the sign-in spec, which needs identity on.
      name: "chromium",
      testIgnore: "**/sign-in.spec.ts",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // The GCIP SignInScreen spec, driven against the identity-ON server below.
      name: "auth",
      testMatch: "**/sign-in.spec.ts",
      use: { ...devices["Desktop Chrome"], baseURL: AUTH_WEB_URL },
    },
  ],
  webServer: [
    {
      command: "pnpm fake-host",
      port: FAKE_HOST_PORT,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      // The host adapter is aliased in unconditionally and NewEngineRoot is
      // the default web root (see packages/web/src/main.tsx) — no env needed.
      command: "pnpm dev",
      port: WEB_PORT,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 120_000,
    },
    {
      // A second vite server with a baked (fake) Firebase key so
      // `isIdentityConfigured()` is true and `SignInScreen` renders. Only the
      // `auth` project points here (baseURL = AUTH_WEB_URL). HOUSTON_E2E_WEB_PORT
      // moves vite's own `server.port` (vite.config.ts) to AUTH_WEB_PORT.
      command: "pnpm dev",
      port: AUTH_WEB_PORT,
      env: {
        HOUSTON_E2E_WEB_PORT: String(AUTH_WEB_PORT),
        FIREBASE_API_KEY: FAKE_FIREBASE_API_KEY,
      },
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 120_000,
    },
  ],
});
