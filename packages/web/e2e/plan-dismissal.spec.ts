import type { Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import {
  armPlan,
  FREE_ROUTINES,
  freePlan,
  installPlanClock,
} from "./support/plan";

/**
 * The plan prompts belong to the whole shell and close on user intent only.
 * Leaving a kept-alive screen with a modal open makes the app dispatch a
 * synthetic Escape at itself (`app/src/components/shell/keep-alive-views.tsx`);
 * that housekeeping must never hide a routine prompt before the user has
 * seen it.
 */

test.beforeEach(async ({ page }) => {
  await installPlanClock(page);
});

/** Exactly what `KeepAliveViews` sends when a screen hides under a modal. */
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
