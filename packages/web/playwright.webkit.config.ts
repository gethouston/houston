import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";

/**
 * The e2e suite on WebKit (`pnpm test:e2e:webkit`) — the engine the desktop
 * app's WKWebView actually runs. Chromium-only runs miss WebKit-specific
 * breakage: the sidebar Change-color submenu was un-clickable ONLY on WebKit
 * (overflow clipping of the un-portalled Radix SubContent, HOU-708). Same
 * config as the default run, different browser. Needs a one-time
 * `pnpm exec playwright install webkit`. Not wired into CI (yet).
 */
export default defineConfig({
  ...base,
  // The visual suite is Chromium-only (its baselines are Chromium renders), so
  // keep it out of the WebKit run just as the default config keeps it out of
  // the chromium project.
  projects: [
    {
      name: "webkit",
      testIgnore: "**/visual/**",
      use: { ...devices["Desktop Safari"] },
    },
  ],
});
