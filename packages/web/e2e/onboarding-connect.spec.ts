import { expect, test } from "./support/fixtures";
import { completeSurvey, resetToFirstRun } from "./support/onboarding";

/**
 * First-run's connect beat, as the game-style in-app tutorial: after the
 * survey the welcome overlay opens over the REAL shell, and each step
 * spotlights the actual control (in-app-onboarding.tsx + tutorial-spotlight)
 * — the user clicks the real sidebar row, lands on the real AI hub, and
 * connects there. Advancement is app state (viewMode, the shared provider
 * status probe), never a Next button.
 *
 * The old separate-screen connect step (ConnectAiMission + the curated
 * ProviderBrowser) is unreachable from first-run now; its curated-mode
 * regression coverage retires with the surface when the legacy orchestrator
 * is deleted.
 */
test("first-run tutorial walks the user to the AI hub through the real sidebar", async ({
  page,
  request,
}) => {
  // Onboarding shows when the v3 host reports ZERO agents.
  await resetToFirstRun(request);

  await page.goto("/");
  await completeSurvey(page);

  // Welcome beat: one action only.
  await expect(
    page.getByRole("heading", { name: "Welcome to Houston!" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Start setup" }).click();

  // The WHAT position: a centered card narrates the step ahead (why the AI
  // must be connected) with its own button.
  await expect(
    page.getByRole("dialog", { name: "Connect your AI" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Show me" }).click();

  // The HOW position: a chip pinned at the AI Models row; the row itself
  // stays clickable through the spotlight's hole.
  await expect(
    page.getByRole("dialog", { name: "Click AI Models" }),
  ).toBeVisible();
  await page.locator("[data-tour-target='nav-ai-hub']").click();

  // The REAL hub opened, and the tutorial advanced to the connect step
  // (zero-agent first-run: no provider is confirmed connected yet, so the
  // coach card holds until one is).
  await expect(
    page.getByRole("heading", { name: "AI Providers" }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Pick the AI you already use." }),
  ).toBeVisible();
});
