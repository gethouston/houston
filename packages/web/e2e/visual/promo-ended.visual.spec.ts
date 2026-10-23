/**
 * Visual-regression baselines for the promo-ended modal: the offer (yearly
 * preselected, and monthly picked), the switched-to-yearly step and the
 * stayed-monthly step, at desktop and phone width, with the Spanish and
 * Portuguese steps the design shows. The modal pins its own dark theme; the
 * shell behind it is shot light. Every value on screen comes from the
 * fixture.
 */
import type { Locator, Page } from "@playwright/test";
import { seedLocale } from "../support/billing-choice";
import { expect, test } from "../support/fixtures";
import { installPlanClock } from "../support/plan";
import {
  enterPromoTeam,
  promoBilling,
  promoOpen,
} from "../support/promo-ended";
import { pinTheme } from "./support";

test.use({ timezoneId: "UTC" });

const PHONE = { width: 390, height: 844 } as const;
type Width = "desktop" | "phone";

async function boot(page: Page, width: Width): Promise<Locator> {
  await installPlanClock(page);
  // The team is picked from the desktop sidebar; the phone narrows after.
  await enterPromoTeam(page, promoBilling());
  const modal = await promoOpen(page);
  if (width === "phone") await page.setViewportSize(PHONE);
  return modal;
}

async function shoot(page: Page, name: string): Promise<void> {
  await page.mouse.move(0, 0);
  await pinTheme(page, "light");
  await expect(page).toHaveScreenshot(name);
}

for (const width of ["desktop", "phone"] as const) {
  test(`promo ended modal, offer — ${width}`, async ({ page }) => {
    await boot(page, width);
    await shoot(page, `promo-ended-offer-${width}.png`);
  });

  test(`promo ended modal, monthly picked — ${width}`, async ({ page }) => {
    const modal = await boot(page, width);
    await modal.getByText("Monthly", { exact: true }).click();
    await expect(
      modal.getByRole("button", { name: "Continue monthly at $20" }),
    ).toBeVisible();
    await shoot(page, `promo-ended-monthly-picked-${width}.png`);
  });
}

test("promo ended modal, switched to yearly, Spanish — desktop", async ({
  page,
}) => {
  await seedLocale(page, "es");
  const modal = await boot(page, "desktop");
  await modal.getByRole("button", { name: "Cambiar al plan anual" }).click();
  await expect(modal).toContainText("Ya estás en el plan anual");
  await shoot(page, "promo-ended-yearly-es-desktop.png");
});

test("promo ended modal, stayed monthly, Portuguese — desktop", async ({
  page,
}) => {
  await seedLocale(page, "pt");
  const modal = await boot(page, "desktop");
  await modal.getByText("Mensal", { exact: true }).click();
  await modal.getByRole("button", { name: /^Continuar no mensal a/ }).click();
  await expect(modal).toContainText("Você continua no plano mensal");
  await shoot(page, "promo-ended-monthly-pt-desktop.png");
});
