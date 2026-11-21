import type { Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import {
  armPlan,
  FREE_ROUTINES,
  freePlan,
  installPlanClock,
} from "./support/plan";

test.beforeEach(async ({ page }) => {
  await installPlanClock(page);
});

async function appEscape(page: Page): Promise<void> {
  await page.evaluate(() =>
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    ),
  );
}

test("the paused-routines prompt ignores the app's own Escape", async ({
  page,
}) => {
  await armPlan({
    summary: freePlan({ routines: { ...FREE_ROUTINES, paused: true } }),
  });
  await page.goto("/");

  const dialog = page
    .getByRole("dialog")
    .filter({ hasText: "Your routines were paused" });
  await expect(dialog).toBeVisible();
  await appEscape(page);
  await page.clock.runFor(1_000);
  await expect(dialog).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});
