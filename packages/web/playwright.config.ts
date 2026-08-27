import { FAKE_HOST_PORT } from "@houston/fake-host";
import { defineConfig, devices } from "@playwright/test";
import {
  AUTH_WEB_PORT,
  AUTH_WEB_URL,
  FAKE_FIREBASE_API_KEY,
  WEB_PORT,
  WEB_URL,
} from "./e2e/config";

const DESKTOP_VIEWPORT = { width: 1440, height: 900 } as const;

// Pin the resolved (possibly worktree-derived) ports into our own env before
// workers spawn: workers inherit them verbatim instead of re-deriving, so a
// worker's in-process fake host can never disagree with the main process.
process.env.HOUSTON_E2E_FAKE_HOST_PORT ??= String(FAKE_HOST_PORT);
process.env.HOUSTON_E2E_WEB_PORT ??= String(WEB_PORT);

/**
 * Playwright drives the FULL desktop UI (app/src) as it runs in the browser
 * (packages/web), on the host adapter in host mode, against an
 * in-memory fake host (@houston/fake-host) — no real backend, no AI provider.
 *
 * The suite runs FULLY PARALLEL: every Playwright worker starts its own
 * in-process fake host on a worker-slot port (see support/fixtures.ts and
 * `@houston/fake-host` config.ts), so workers never share host state. The
 * `webServer` fake host below serves only the main process (global-setup's
 * warm-up); vite is shared by all workers, which is fine once warm.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  // Warm the vite dev server before the timed suite so the first test doesn't
  // pay vite's cold on-demand compile inside its assertion budget (see
  // e2e/support/global-setup.ts).
  globalSetup: "./e2e/support/global-setup.ts",
  fullyParallel: true,
  // CI runners (ubuntu-latest) have 4 vCPUs, and page boots are served by ONE
  // single-threaded vite dev process — at 4 workers renders starve past the
  // 10s expect budget (run 30596416439: 14 timing failures), and even at 2
  // the heavy signed-in specs flake on animation transients (run
  // 30597930896: stuck AnimatePresence exit ghosts duplicate kanban cards).
  // CI therefore runs ONE worker per runner — the density the suite has
  // always been stable at — and gets its throughput from sharding across
  // runners (ci.yml `--shard`).
  //
  // Locally the cap is 4, NOT Playwright's half-the-cores default: a worker is
  // a full Chromium, and nine of them own an 18-core Mac outright — on a
  // machine hosting many agent worktrees the review-phase suite must leave the
  // iteration sessions their cores (the suite also holds the machine-wide lock,
  // so capped throughput only stretches a phase where wall time is cheap).
  // HOUSTON_E2E_WORKERS overrides for a dedicated box.
  workers: process.env.CI ? 1 : Number(process.env.HOUSTON_E2E_WORKERS || 4),
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  expect: {
    timeout: 10_000,
    // Visual-regression defaults (only the `visual` project asserts screenshots).
    // Freeze CSS animations/transitions and the text caret so a shot is a
    // function of layout + tokens alone, and allow a hair of antialiasing drift.
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.01,
    },
  },
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never" }]]
    : [["list"]],
  use: {
    baseURL: WEB_URL,
    // Keep trace + video recording ON for every attempt, in CI too. Skipping
    // them on first attempts ("on-first-retry") was tried to save encode CPU
    // and produced first-attempt-only flakes that no retry ever reproduced:
    // recording paces the page slightly, and the unrecorded attempts ran
    // FASTER than the suite ever had, exposing UI races (a nav click landing
    // with the panel never switching; AnimatePresence crossfades caught
    // mid-flight as duplicate cards). Recording parity with every attempt is
    // part of the environment the suite is stable in; with the suite sharded
    // across runners the overhead is cheap.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      // The identity-OFF server (no baked Firebase key): the whole suite boots
      // straight to the shell. Excludes the sign-in spec, which needs identity
      // on, and the visual suite, which runs as its own project below (so the
      // default `test:e2e` run — and CI — never picks up pixel baselines).
      name: "chromium",
      testIgnore: ["**/sign-in.spec.ts", "**/visual/**", "**/mobile/**"],
      use: { ...devices["Desktop Chrome"], viewport: DESKTOP_VIEWPORT },
    },
    {
      // Phone-class project (Pixel 7: 412px logical width, touch, mobile UA)
      // against the SAME identity-OFF server as `chromium`. Only `e2e/mobile/`
      // specs run here — phone coverage is written into that directory
      // deliberately, spec by spec, rather than re-running the desktop suite
      // at a width it was never written for.
      name: "mobile",
      testDir: "./e2e/mobile",
      use: { ...devices["Pixel 7"] },
    },
    {
      // Visual-regression suite (pixel baselines). Runs ONLY via `test:visual`
      // (`--project visual`), never inside `test:e2e`, so CI behavior is
      // unchanged. A fixed viewport keeps layout stable across machines;
      // baselines are platform-suffixed (see snapshotPathTemplate) because a
      // darwin PNG will not match a Linux render pixel-for-pixel.
      name: "visual",
      testDir: "./e2e/visual",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
      },
      snapshotPathTemplate:
        "{testDir}/__screenshots__/{testFileName}/{arg}{-platform}{ext}",
    },
    {
      // The GCIP SignInScreen spec, driven against the identity-ON server below.
      name: "auth",
      testMatch: "**/sign-in.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: AUTH_WEB_URL,
        viewport: DESKTOP_VIEWPORT,
      },
    },
  ],
  webServer: [
    {
      // The resolved (possibly worktree-derived) port is passed EXPLICITLY so
      // the child process cannot re-derive differently from another cwd.
      command: "pnpm fake-host",
      port: FAKE_HOST_PORT,
      env: { HOUSTON_E2E_FAKE_HOST_PORT: String(FAKE_HOST_PORT) },
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      // The host adapter is aliased in unconditionally and NewEngineRoot is
      // the default web root (see packages/web/src/main.tsx). Identity must be
      // explicitly OFF here: loadEnv also reads the developer's ambient env,
      // and an installed Firebase key would otherwise turn the entire
      // functional project into the sign-in surface.
      command: "pnpm dev",
      port: WEB_PORT,
      env: {
        HOUSTON_E2E_WEB_PORT: String(WEB_PORT),
        FIREBASE_API_KEY: "",
      },
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
