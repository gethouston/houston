/**
 * Visual-regression baselines for the pick after the cutover applied it: the
 * applied view a provisional payer confirms, the success step after a change,
 * and the note an owner who picked reads, at desktop and phone width. The
 * page clock sits inside the change window and every value on screen comes
 * from the fixture. The modal pins its own dark theme; the shell behind it is
 * shot light.
 */
import type { BillingChoice } from "@houston/wire-types";
import type { Locator, Page } from "@playwright/test";
import {
  armCapabilities,
  choiceModal,
  SPACES_OWNER_CAPS,
} from "../support/billing-choice";
import { expect, test } from "../support/fixtures";
import {
  armApplied,
  installAfterCutoverClock,
  pickedNonPayer,
  provisionalPayer,
} from "../support/pick-confirm";
import { pinTheme } from "./support";

test.use({ timezoneId: "UTC" });

const PHONE = { width: 390, height: 844 } as const;
type Width = "desktop" | "phone";

async function boot(
  page: Page,
  width: Width,
  choice: BillingChoice,
): Promise<Locator> {
  await installAfterCutoverClock(page);
  if (width === "phone") await page.setViewportSize(PHONE);
  await armCapabilities(SPACES_OWNER_CAPS);
  await armApplied(choice);
  await page.goto("/");
  const modal = choiceModal(page);
  await expect(modal.getByRole("button").first()).toBeVisible({
    timeout: 15_000,
  });
  return modal;
}

async function shoot(page: Page, name: string): Promise<void> {
  await page.mouse.move(0, 0);
  await pinTheme(page, "light");
  await expect(page).toHaveScreenshot(name);
}

for (const width of ["desktop", "phone"] as const) {
  test(`applied pick, confirm — ${width}`, async ({ page }) => {
    const modal = await boot(page, width, provisionalPayer());
    await expect(modal.getByRole("button", { name: "Confirm" })).toBeVisible();
    await shoot(page, `pick-confirm-applied-${width}.png`);
  });

  test(`applied pick, changed success step — ${width}`, async ({ page }) => {
    const modal = await boot(page, width, provisionalPayer());
    await modal.getByRole("button", { name: "Change" }).click();
    await modal.getByText("La Fila", { exact: true }).click();
    await modal.getByRole("button", { name: "Use it for La Fila" }).click();
    await modal
      .getByRole("button", { name: "Keep Personal on the free tier" })
      .click();
    await expect(modal.getByRole("button", { name: "Done" })).toBeVisible();
    await expect(modal).toContainText("Locks November 6");
    await shoot(page, `pick-confirm-changed-${width}.png`);
  });

  test(`applied pick, note — ${width}`, async ({ page }) => {
    const modal = await boot(page, width, pickedNonPayer());
    await expect(modal.getByRole("button", { name: "Got it" })).toBeVisible();
    await shoot(page, `pick-confirm-note-${width}.png`);
  });
}
