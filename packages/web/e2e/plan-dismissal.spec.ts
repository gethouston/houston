import type { Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import {
  announcementDialog,
  armPlan,
  FREE_ROUTINES,
  freePlan,
  installPlanClock,
  LIMITS_START_AT,
  planCallCount,
  stubOpener,
} from "./support/plan";

/**
 * The plan prompts belong to the whole shell and close on user intent only.
 * Leaving a kept-alive screen with a modal open makes the app dispatch a
 * synthetic Escape at itself (`app/src/components/shell/keep-alive-views.tsx`);
 * that housekeeping must never dismiss the launch announcement for good, nor
 * hide a routine prompt, before the user has seen it.
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

test("the launch announcement ignores the app's own Escape; the user's closes it", async ({
  page,
}) => {
  await stubOpener(page, false);
  await armPlan({
    summary: freePlan({ announcement: true, limitsStartAt: LIMITS_START_AT }),
  });
  await page.goto("/");

  const dialog = announcementDialog(page);
  await expect(dialog).toBeVisible();
  await appEscape(page);
  await page.clock.runFor(1_000);
  await expect(dialog).toBeVisible();
  expect(await planCallCount("announcement")).toBe(0);

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect.poll(() => planCallCount("announcement")).toBe(1);
});

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
