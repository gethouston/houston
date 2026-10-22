/**
 * Visual-regression baselines for the pricing-change modal: an owner's two
 * intro pages, the picker, a payer's paid step then free step, and both
 * success steps in the same frame,
 * the read-only member and single-org notices, and the Spanish intro, at
 * desktop and phone width. The page clock is pinned before the cutover and
 * every value on screen comes from the fixture. The modal pins its own dark theme; the shell
 * behind it is shot light.
 */
import type { BillingChoice } from "@houston/wire-types";
import type { Locator, Page } from "@playwright/test";
import {
  armCapabilities,
  armChoice,
  choiceModal,
  installChoiceClock,
  memberChoice,
  openPicker,
  ownerChoice,
  payerChoice,
  SPACES_OWNER_CAPS,
  seedLocale,
  singleOrgChoice,
} from "../support/billing-choice";
import { expect, test } from "../support/fixtures";
import { pinTheme } from "./support";

test.use({ timezoneId: "UTC" });

const PHONE = { width: 390, height: 844 } as const;
type Width = "desktop" | "phone";

async function boot(
  page: Page,
  width: Width,
  choice: BillingChoice,
): Promise<Locator> {
  await installChoiceClock(page);
  if (width === "phone") await page.setViewportSize(PHONE);
  await armCapabilities(SPACES_OWNER_CAPS);
  await armChoice(choice);
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
  test(`pricing change modal, owner intro — ${width}`, async ({ page }) => {
    await boot(page, width, ownerChoice());
    await shoot(page, `billing-change-modal-intro-${width}.png`);
  });

  test(`pricing change modal, not kept page — ${width}`, async ({ page }) => {
    const modal = await boot(page, width, ownerChoice());
    await modal.getByRole("button", { name: "Next", exact: true }).click();
    await expect(modal).toContainText("Nothing gets deleted");
    await shoot(page, `billing-change-modal-not-kept-${width}.png`);
  });

  test(`pricing change modal, picker step — ${width}`, async ({ page }) => {
    const modal = await boot(page, width, ownerChoice());
    await openPicker(modal);
    await expect(modal.getByRole("radio").first()).toBeVisible();
    await shoot(page, `billing-change-modal-picker-${width}.png`);
  });

  test(`pricing change modal, success step — ${width}`, async ({ page }) => {
    const modal = await boot(page, width, ownerChoice());
    await openPicker(modal);
    await modal.getByRole("button", { name: "Keep La Fila free" }).click();
    await expect(modal.getByRole("button", { name: "Done" })).toBeVisible();
    await expect(modal).toContainText("La Fila stays free");
    await shoot(page, `billing-change-modal-done-${width}.png`);
  });

  test(`pricing change modal, Spanish intro — ${width}`, async ({ page }) => {
    await seedLocale(page, "es");
    const modal = await boot(page, width, ownerChoice());
    await expect(modal).toContainText("Los equipos salieron de beta");
    await shoot(page, `billing-change-modal-intro-es-${width}.png`);
  });

  test(`pricing change modal, payer step — ${width}`, async ({ page }) => {
    const modal = await boot(page, width, payerChoice());
    await expect(modal).toContainText(
      "Your subscription covers one organization",
    );
    await openPicker(modal, true);
    await expect(modal).toContainText("Step 3 of 5");
    await shoot(page, `billing-change-modal-payer-${width}.png`);
  });
}

test("pricing change modal, payer free step — desktop", async ({ page }) => {
  const modal = await boot(page, "desktop", payerChoice());
  await openPicker(modal, true);
  await modal.getByRole("button", { name: "Use it for La Fila" }).click();
  await expect(modal).toContainText("Step 4 of 5");
  await shoot(page, "billing-change-modal-payer-free-desktop.png");
});

test("pricing change modal, payer success step — desktop", async ({ page }) => {
  const modal = await boot(page, "desktop", payerChoice());
  await openPicker(modal, true);
  await modal.getByText("Innova", { exact: true }).click();
  await modal.getByRole("button", { name: "Use it for Innova" }).click();
  await modal.getByRole("button", { name: "Keep La Fila free" }).click();
  await expect(modal.getByRole("button", { name: "Done" })).toBeVisible();
  await expect(modal).toContainText("Your subscription");
  await expect(modal).toContainText("Needs a plan");
  await shoot(page, "billing-change-modal-done-payer-desktop.png");
});

test("pricing change modal, member — desktop", async ({ page }) => {
  const modal = await boot(page, "desktop", memberChoice());
  await expect(modal).toContainText("Nothing to do on your side");
  await shoot(page, "billing-change-modal-member-desktop.png");
});

test("pricing change modal, single org — desktop", async ({ page }) => {
  const modal = await boot(page, "desktop", singleOrgChoice());
  await expect(modal).toContainText("La Fila stays free");
  await shoot(page, "billing-change-modal-single-org-desktop.png");
});
