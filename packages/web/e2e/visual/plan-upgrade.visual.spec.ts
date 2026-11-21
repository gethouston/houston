import type { Locator, Page } from "@playwright/test";
import { expect, test } from "../support/fixtures";
import { openMoreMenu } from "../support/mobile-nav";
import { armPlan, freePlan, installPlanClock } from "../support/plan";
import { pinTheme, THEMES } from "./support";

type Width = "desktop" | "collapsed" | "phone";

async function boot(page: Page, width: Width, percent: number) {
  await installPlanClock(page);
  await armPlan({
    summary: freePlan({ usage: { percent, used: percent, limit: 100 } }),
  });
  if (width === "phone")
    await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
}

async function area(page: Page, width: Width): Promise<Locator> {
  if (width === "phone") return openMoreMenu(page, "click");
  const footer = page.getByTestId("sidebar-footer");
  await expect(footer.getByTestId("plan-upgrade")).toBeVisible({
    timeout: 20_000,
  });
  if (width === "collapsed")
    await page.getByRole("button", { name: "Collapse sidebar" }).click();
  return footer;
}

const CASES: { width: Width; percent: number }[] = [
  ...(["desktop", "phone"] as const).flatMap((width) =>
    [25, 85, 100].map((percent) => ({ width, percent })),
  ),
  { width: "collapsed", percent: 100 },
];

for (const { width, percent } of CASES) {
  for (const theme of THEMES) {
    test(`upgrade ${percent}% ${width} ${theme}`, async ({ page }) => {
      await boot(page, width, percent);
      const shot = await area(page, width);
      await expect(shot.getByTestId("plan-upgrade")).toBeVisible({
        timeout: 20_000,
      });
      await pinTheme(page, theme);
      await page.mouse.move(0, 0);
      await expect(shot).toHaveScreenshot(
        `upgrade-${percent}-${width}-${theme}.png`,
      );
    });
  }
}
