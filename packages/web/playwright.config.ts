import { FAKE_HOST_PORT } from "@houston/fake-host";
import { defineConfig, devices } from "@playwright/test";
import {
  AUTH_WEB_PORT,
  AUTH_WEB_URL,
  FAKE_FIREBASE_API_KEY,
  WEB_PORT,
  WEB_URL,
} from "./e2e/config";
import { type BundleName, resolveServeMode } from "./e2e/support/serve-mode";

const DESKTOP_VIEWPORT = { width: 1440, height: 900 } as const;

const serveMode = resolveServeMode();

function webServerCommand(bundle: BundleName, port: number): string {
  if (serveMode === "dev") return "pnpm dev";
  return `pnpm e2e:serve ${bundle} ${port}`;
}

process.env.HOUSTON_E2E_FAKE_HOST_PORT ??= String(FAKE_HOST_PORT);
process.env.HOUSTON_E2E_WEB_PORT ??= String(WEB_PORT);

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  globalSetup: "./e2e/support/global-setup.ts",
  fullyParallel: true,
  workers: Number(process.env.HOUSTON_E2E_WORKERS || (process.env.CI ? 3 : 4)),
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 30_000,
  expect: {
    timeout: 10_000,
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
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      testIgnore: ["**/sign-in.spec.ts", "**/visual/**", "**/mobile/**"],
      use: { ...devices["Desktop Chrome"], viewport: DESKTOP_VIEWPORT },
    },
    {
      name: "mobile",
      testDir: "./e2e/mobile",
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "visual",
      testDir: "./e2e/visual",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
        contextOptions: { reducedMotion: "reduce" },
      },
      snapshotPathTemplate:
        "{testDir}/__screenshots__/{testFileName}/{arg}{-platform}{ext}",
    },
    {
      name: "auth",
      testMatch: "**/sign-in.spec.ts",
      testIgnore: ["**/mobile/**"],
      use: {
        ...devices["Desktop Chrome"],
        baseURL: AUTH_WEB_URL,
        viewport: DESKTOP_VIEWPORT,
      },
    },
  ],
  webServer: [
    {
      command: "pnpm fake-host",
      port: FAKE_HOST_PORT,
      env: { HOUSTON_E2E_FAKE_HOST_PORT: String(FAKE_HOST_PORT) },
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: webServerCommand("shell", WEB_PORT),
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
      command: webServerCommand("sign-in", AUTH_WEB_PORT),
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
