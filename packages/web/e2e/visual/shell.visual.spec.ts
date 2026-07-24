/**
 * Visual-regression baselines for the main shell (sidebar + mission board).
 *
 * The board is Houston's home screen — "Mission Control" with the sidebar,
 * titlebar, and the seeded missions. It is fully deterministic under the fake
 * host: two seeded missions with FIXED timestamps (state-store.ts `EPOCH`),
 * and the kanban cards render no relative time (only sort by it), so the whole
 * screen is stable. We capture it in both themes at a fixed desktop viewport,
 * plus one narrow-width run (the most important screen gets responsive
 * coverage).
 *
 * Determinism rules for this suite live in ../README.md. In short: fixed
 * viewport, `animations: "disabled"` (config-wide), a small
 * `maxDiffPixelRatio`, and — because these screens carry no live clock or
 * streaming region — no masks are needed here.
 */
import { expect, test } from "../support/fixtures";
import { pinTheme, THEMES } from "./support";

for (const theme of THEMES) {
  test(`board home — ${theme}`, async ({ page }) => {
    await page.goto("/");

    // Anchor on the shell being fully painted before pinning theme + comparing.
    await expect(page.getByText("Mission Control")).toBeVisible();
    await expect(page.getByText("Plan a trip to Tokyo")).toBeVisible();
    await expect(page.getByText("Draft the launch email")).toBeVisible();
    await pinTheme(page, theme);

    await expect(page).toHaveScreenshot(`board-${theme}.png`, {
      fullPage: true,
    });
  });
}

/**
 * Narrow-width run for the board — the responsive layout is the one most worth
 * guarding against drift (the sidebar collapse / column reflow). Light only:
 * the theme axis is already covered full-width above, and one narrow baseline
 * keeps the matrix lean.
 */
test("board home — narrow", async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 900 });
  await page.goto("/");

  await expect(page.getByText("Plan a trip to Tokyo")).toBeVisible();

  await expect(page).toHaveScreenshot("board-narrow.png", { fullPage: true });
});
