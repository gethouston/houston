import type { Page } from "@playwright/test";
import { expect, test } from "../support/fixtures";
import { installPlanClock, PLAN_NOW } from "../support/plan";
import { pinTheme, THEMES } from "./support";

const DAY = 24 * 60 * 60 * 1000;
const DEADLINE = Date.parse(PLAN_NOW) + 3.5 * DAY;

async function withClaudeDeadline(page: Page): Promise<void> {
  await page.route("**/providers", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const response = await route.fetch();
    const rows = (await response.json()) as Record<string, unknown>[];
    const json = rows.map((row) =>
      row.id === "anthropic"
        ? { ...row, configured: true, reconnectBy: DEADLINE }
        : row,
    );
    await route.fulfill({ response, json });
  });
}

for (const width of ["desktop", "phone"] as const) {
  for (const theme of THEMES) {
    test(`reconnect notice ${width} ${theme}`, async ({ page }) => {
      await installPlanClock(page);
      await withClaudeDeadline(page);
      if (width === "phone")
        await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/");
      const strip = page.getByTestId("provider-reconnect-notice");
      await expect(strip).toBeVisible({ timeout: 20_000 });
      await expect(strip).toContainText(
        "Your Anthropic session ends in 3 days.",
      );
      await expect(strip).toContainText("Sign in again");
      await pinTheme(page, theme);
      await page.mouse.move(0, 0);
      await expect(page).toHaveScreenshot(
        `reconnect-notice-${width}-${theme}.png`,
      );
    });
  }
}
