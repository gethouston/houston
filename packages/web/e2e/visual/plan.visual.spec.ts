/**
 * Visual-regression baselines for the C19 personal plan: the Billing screen of
 * a Free person with the launch discount and the early offer, and the one-time
 * launch announcement, each at desktop and phone width.
 *
 * Deterministic by construction: the page clock starts at `PLAN_NOW` and every
 * instant on screen comes from the fixture (`support/plan.ts`), formatted in
 * the launch zone; the Free usage stays under 100%, so no local reset time is
 * drawn. The announcement pins its own dark theme; Billing is shot light.
 */
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
} from "../support/plan";
import { openSettings } from "../support/settings-nav";
import { pinTheme } from "./support";

test.use({ timezoneId: "UTC" });

const PHONE = { width: 390, height: 844 } as const;

type Width = "desktop" | "phone";

async function boot(page: Page, width: Width): Promise<void> {
  await installPlanClock(page);
  if (width === "phone") await page.setViewportSize(PHONE);
  await page.goto("/");
}

async function openBillingAt(page: Page, width: Width): Promise<void> {
  if (width === "desktop") await openSettings(page);
  else {
    await openMoreMenu(page, "click");
    await moreRow(page, "nav-settings").click();
  }
  await billingRow(page).click();
  const billing = billingScreen(page);
  await expect(
    billing.getByRole("button", { name: "Get Plus for $10" }),
  ).toBeVisible();
  await expect(billing.getByText("No invoices yet")).toBeVisible();
}

for (const width of ["desktop", "phone"] as const) {
  test(`billing, Free with the early offer — ${width}`, async ({ page }) => {
    await armPlan({ summary: freePlan() });
    await boot(page, width);
    await openBillingAt(page, width);
    await page.mouse.move(0, 0);
    await pinTheme(page, "light");

    await expect(page).toHaveScreenshot(`billing-free-offer-${width}.png`, {
      fullPage: true,
    });
  });

  test(`launch announcement — ${width}`, async ({ page }) => {
    await armPlan({
      summary: freePlan({ announcement: true, limitsStartAt: LIMITS_START_AT }),
    });
    await boot(page, width);
    const dialog = announcementDialog(page);
    await expect(
      dialog.getByRole("button", { name: "Get my first month for $10" }),
    ).toBeVisible();
    if (width === "desktop") {
      // The astronaut is painted beside the copy; shoot it decoded, not blank.
      const image = dialog.locator("img");
      await expect
        .poll(() =>
          image.evaluate(
            (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
          ),
        )
        .toBe(true);
    }
    await page.mouse.move(0, 0);
    await pinTheme(page, "light");

    await expect(page).toHaveScreenshot(`plan-announcement-${width}.png`);
  });
}
