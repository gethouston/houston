/**
 * Visual-regression baselines for the org-status strip: a locked org read by
 * the owner who pays and by a member, a scheduled lock and a failed payment,
 * at desktop and phone width. The page clock is the plan clock and every
 * date on screen comes from the fixture (`support/org-lock.ts`).
 */
import type { Page } from "@playwright/test";
import { expect, test } from "../support/fixtures";
import {
  armOrgLock,
  LOCKED,
  type OrgLockArming,
  PAST_DUE,
  SCHEDULED,
  statusBanner,
} from "../support/org-lock";
import { pinTheme } from "./support";

test.use({ timezoneId: "UTC" });

const PHONE = { width: 390, height: 844 } as const;

const CASES: Record<string, OrgLockArming> = {
  "locked-owner": { team: LOCKED },
  "locked-member": {
    team: { ...LOCKED, isBillingOwner: false },
    role: "user",
  },
  scheduled: { team: SCHEDULED },
  "past-due": { team: PAST_DUE },
};

async function boot(page: Page, arming: OrgLockArming): Promise<void> {
  await armOrgLock(page, arming);
  await page.goto("/");
  await expect(statusBanner(page)).toBeVisible({ timeout: 15_000 });
}

for (const width of ["desktop", "phone"] as const)
  for (const [name, arming] of Object.entries(CASES))
    test(`org status strip, ${name} (${width})`, async ({ page }) => {
      if (width === "phone") await page.setViewportSize(PHONE);
      await boot(page, arming);
      await page.mouse.move(0, 0);
      await pinTheme(page, "light");
      await expect(page).toHaveScreenshot(`org-status-${name}-${width}.png`);
    });
