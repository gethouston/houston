/**
 * Visual-regression baselines for the org plan: Admin > Billing of a free
 * org (the share of the week, the price and Upgrade) and of a paid one (seats,
 * the total and Manage billing), each at desktop and phone width.
 *
 * Deterministic by construction: the page clock starts at `PLAN_NOW` and every
 * instant on screen comes from the fixture (`support/plan.ts`). Shot light.
 */

import type { PlanSummary } from "@houston/wire-types";
import type { Page } from "@playwright/test";
import { expect, test } from "../support/fixtures";
import {
  armOrgPlan,
  freePlan,
  installPlanClock,
  openOrgBilling,
  plusPlan,
} from "../support/plan";
import { pinTheme } from "./support";

test.use({ timezoneId: "UTC" });

const PHONE = { width: 390, height: 844 } as const;

type Width = "desktop" | "phone";

async function boot(page: Page, width: Width): Promise<void> {
  await installPlanClock(page);
  if (width === "phone") await page.setViewportSize(PHONE);
  await page.goto("/");
}

const PLANS: Record<"free" | "paid", PlanSummary> = {
  // A fixed reset, or the fake host dates it a week from its own clock.
  free: freePlan({
    usage: {
      percent: 25,
      used: 10,
      limit: 40,
      resetsAt: "2026-10-07T17:00:00.000Z",
    },
  }),
  paid: plusPlan(true),
};

for (const width of ["desktop", "phone"] as const)
  for (const plan of ["free", "paid"] as const)
    test(`org billing, ${plan} — ${width}`, async ({ page }) => {
      await armOrgPlan({ summary: PLANS[plan] });
      await boot(page, width);
      await openOrgBilling(page);
      await page.mouse.move(0, 0);
      await pinTheme(page, "light");

      await expect(page).toHaveScreenshot(`org-billing-${plan}-${width}.png`, {
        fullPage: true,
      });
    });
