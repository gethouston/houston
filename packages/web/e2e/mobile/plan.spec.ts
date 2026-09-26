import type { Page } from "@playwright/test";
import { expect, test } from "../support/fixtures";
import { moreRow, openMoreMenu } from "../support/mobile-nav";
import {
  announcementDialog,
  armPlan,
  billingRow,
  billingScreen,
  freePlan,
  installPlanClock,
  LIMITS_START_AT,
  planCallCount,
  stubOpener,
} from "../support/plan";
import { screen } from "../support/team-nav";

/**
 * The C19 personal plan on the phone: Billing reached through the More menu's
 * Settings row, and the launch announcement as a full-height sheet. The desktop
 * twin (`../plan.spec.ts`) covers the flows; this proves the phone layout holds
 * them without a horizontal scroll.
 */

test.beforeEach(async ({ page }) => {
  await installPlanClock(page);
});

async function expectNoOverflow(page: Page): Promise<void> {
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);
}

test("Billing on Free fits the phone: usage, offer and checkout", async ({
  page,
}) => {
  await stubOpener(page, false);
  await armPlan({ summary: freePlan() });
  await page.goto("/");
  await openMoreMenu(page);
  await moreRow(page, "nav-settings").tap();
  await expect(screen(page)).toHaveAttribute("data-screen", "settings");
  await billingRow(page).tap();

  const billing = billingScreen(page);
  await expect(billing.getByText("25% of your weekly usage")).toBeVisible();
  await expect(billing.getByText("Launch discount")).toBeVisible();
  const upgrade = billing.getByRole("button", { name: "Get Plus for $10" });
  await expect(upgrade).toBeVisible();
  await expectNoOverflow(page);
  await expect(page.locator("body")).not.toContainText(/unlimited/i);

  await upgrade.tap();
  await expect(upgrade).toBeDisabled();
  await expect.poll(() => planCallCount("checkout")).toBe(1);
});

test("the launch announcement fills the phone and dismisses once", async ({
  page,
}) => {
  await armPlan({
    summary: freePlan({ announcement: true, limitsStartAt: LIMITS_START_AT }),
  });
  await page.goto("/");

  const dialog = announcementDialog(page);
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Get my first month for $10" }),
  ).toBeVisible();
  await expectNoOverflow(page);
  await expect(page.locator("body")).not.toContainText(/unlimited/i);

  await dialog
    .locator('button:not([data-slot="dialog-close"])', {
      hasText: "Maybe later",
    })
    .tap();
  await expect(dialog).toBeHidden();
  await expect.poll(() => planCallCount("announcement")).toBe(1);
});
