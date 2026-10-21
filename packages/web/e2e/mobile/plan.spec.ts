import type { Page } from "@playwright/test";
import { expect, test } from "../support/fixtures";
import {
  armOrgPlan,
  freePlan,
  installPlanClock,
  openOrgBilling,
  planCallCount,
  stubOpener,
} from "../support/plan";

/**
 * The org plan on the phone: Admin > Billing reached through the More menu.
 * The desktop twin (`../plan.spec.ts`) covers the flows; this proves the
 * phone layout holds them without a horizontal scroll.
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

test("Admin > Billing on a free org fits the phone and checks out", async ({
  page,
}) => {
  await stubOpener(page, false);
  await armOrgPlan({ summary: freePlan() });
  await page.goto("/");
  const billing = await openOrgBilling(page);

  await expect(billing.getByText("25% used")).toBeVisible();
  await expect(billing.getByText("$15 a month for 1 member")).toBeVisible();
  const upgrade = billing.getByRole("button", { name: "Upgrade" });
  await expect(upgrade).toBeVisible();
  await expectNoOverflow(page);

  await upgrade.tap();
  await expect(upgrade).toBeDisabled();
  await expect.poll(() => planCallCount("checkout")).toBe(1);
});
