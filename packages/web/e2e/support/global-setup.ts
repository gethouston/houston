/**
 * One-time warm-up for the UI suite.
 *
 * playwright.config starts vite as a `webServer`, but Playwright only waits for
 * the PORT to open — not for vite to compile anything. vite dev transforms
 * modules on demand, so the FIRST navigation that reaches the lazily-imported
 * desktop graph (`../app-tree`, behind the "Loading Houston…" Suspense boundary
 * in src/new-engine) pays the entire cold-compile cost in one shot. On a cold CI
 * runner that compile blew past the 10s assertion timeout, so the run's first
 * test failed waiting for the shell ("Your Agents"). It passed on retry (vite was
 * warm by then), which Playwright scores as "flaky" — exit 0, green CI — so the
 * failure was silent.
 *
 * Booting the shell once here moves that compile OUT of the timed window: every
 * test then runs against an already-warm dev server. globalSetup runs after the
 * webServer is up and before any worker starts, so the warm-up is complete before
 * the first assertion's clock begins.
 */
import { chromium, type FullConfig } from "@playwright/test";
import { WEB_URL } from "../config";
import { seedPage } from "./seed";

export default async function globalSetup(_config: FullConfig): Promise<void> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    // Same boot seed the tests use, so we reach the shell instead of the Connect
    // screen and warm the real app-tree chunk the suite exercises.
    await seedPage(page);
    await page.goto(WEB_URL);
    // The sidebar header proves the app-tree chunk finished compiling. Generous
    // timeout: this is the one place that absorbs the cold compile.
    await page
      .getByText("Your Agents")
      .waitFor({ state: "visible", timeout: 120_000 });
  } finally {
    await browser.close();
  }
}
