import { expect, test } from "../support/fixtures";
import { openMoreMenu } from "../support/mobile-nav";
import {
  armOrgPlan,
  freePlan,
  installPlanClock,
  orgBilling,
  planCallCount,
} from "../support/plan";

for (const { percent, status } of [
  { percent: 25, status: "Free plan" },
  { percent: 85, status: "85% used" },
  { percent: 100, status: "Limit reached" },
]) {
  test(`More offers upgrade at ${percent}% and closes onto Billing`, async ({
    page,
  }) => {
    await installPlanClock(page);
    await armOrgPlan({
      summary: freePlan({ usage: { percent, used: percent, limit: 100 } }),
    });
    await page.goto("/");
    const menu = await openMoreMenu(page);
    const upgrade = menu.getByTestId("plan-upgrade");
    await expect(upgrade).toContainText(status);
    await expect(upgrade).toContainText("Upgrade");
    await upgrade.tap();
    await expect(menu).toBeHidden();
    await expect(orgBilling(page).getByTestId("billing-plan")).toBeVisible();
    expect(await planCallCount("checkout")).toBe(0);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(0);
  });
}
