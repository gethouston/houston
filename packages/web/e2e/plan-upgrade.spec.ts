import { expect, test } from "./support/fixtures";
import {
  armOrgPlan,
  armPlan,
  freePlan,
  installPlanClock,
  orgBilling,
  planCallCount,
  plusPlan,
} from "./support/plan";

test.beforeEach(async ({ page }) => {
  await installPlanClock(page);
});

for (const { percent, status } of [
  { percent: 25, status: "Free tier" },
  { percent: 80, status: "80% used" },
  { percent: 100, status: "Limit reached" },
]) {
  test(`sidebar upgrade stays visible at ${percent}% and opens Billing`, async ({
    page,
  }) => {
    await armOrgPlan({
      summary: freePlan({ usage: { percent, used: percent, limit: 100 } }),
    });
    await page.goto("/");
    const upgrade = page
      .getByTestId("sidebar-footer")
      .getByTestId("plan-upgrade");
    await expect(upgrade).toContainText(status);
    await expect(upgrade).toContainText("Upgrade");
    await expect(upgrade).toHaveAccessibleName(`Upgrade. ${status}`);
    const apps = page.locator('[data-tour-target="nav-integrations"]');
    const upgradeBox = await upgrade.boundingBox();
    const appsBox = await apps.boundingBox();
    if (!upgradeBox || !appsBox)
      throw new Error("Footer controls must be visible");
    expect(upgradeBox.y + upgradeBox.height).toBeLessThanOrEqual(appsBox.y);
    await upgrade.click();
    await expect(orgBilling(page).getByTestId("billing-plan")).toBeVisible();
    expect(await planCallCount("checkout")).toBe(0);
  });
}

test("collapsed sidebar keeps upgrade and its usage state accessible", async ({
  page,
}) => {
  await armOrgPlan({
    summary: freePlan({ usage: { percent: 100, used: 40, limit: 40 } }),
  });
  await page.goto("/");
  await expect(page.getByTestId("plan-upgrade")).toBeVisible();
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  const upgrade = page.getByTestId("plan-upgrade");
  await expect(upgrade).toHaveAccessibleName("Upgrade. Limit reached");
  await upgrade.click();
  await expect(orgBilling(page).getByTestId("billing-plan")).toBeVisible();
});

test("a paid org and deployments without org billing have no upgrade entry", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("sidebar-footer")).toBeVisible();
  await expect(page.getByTestId("plan-upgrade")).toHaveCount(0);
  await armPlan({ summary: plusPlan(true) });
  // The paid org's billing rides the orgs list: once it is read, no row.
  await Promise.all([
    page.waitForResponse(
      (res) => new URL(res.url()).pathname === "/v1/orgs" && res.ok(),
    ),
    page.reload(),
  ]);
  await expect(page.getByTestId("sidebar-footer")).toBeVisible();
  await expect(page.getByTestId("plan-upgrade")).toHaveCount(0);
});
