/**
 * Visual-regression baseline for the first-run experience.
 *
 * The app's true first screen is the LANGUAGE gate (before sign-in and the
 * agreement). The base fixture seeds `locale=en` to skip it, so here we clear
 * that pref (and i18next's detector cache) to render the picker — exactly as
 * onboarding-language.spec.ts does. It is a flat, centered light card with a
 * button per language: no backdrop photo, no clock, no host data → fully
 * deterministic.
 *
 * The first-run flow pins `data-theme="light"` itself (a dark-mode user still
 * gets a light first-run — see theme-pin.spec.ts), so there is a single
 * baseline, no theme axis.
 */
import { expect, test } from "../support/fixtures";

test("first-run language gate", async ({ page }) => {
  // Drop the seeded locale so the LanguageGate renders as the first screen.
  await page.addInitScript(() => {
    localStorage.removeItem("houston.pref.locale");
    localStorage.removeItem("i18nextLng");
  });
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Choose your language" }),
  ).toBeVisible();
  // The picker's three language buttons anchor a fully-painted card.
  await expect(page.getByRole("button", { name: "English" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Português" })).toBeVisible();

  await expect(page).toHaveScreenshot("first-run-language.png", {
    fullPage: true,
  });
});
