import { subscriptionCard } from "../support/connect-ai";
import { expect, test } from "../support/fixtures";
import {
  connectAi,
  connectAiStep,
  managerStep,
} from "../support/manager-onboarding";
import { openManagerOnboarding, resetToFirstRun } from "../support/onboarding";
import { pinTheme, THEMES } from "./support";

test("first-run language gate", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.removeItem("houston.pref.locale");
    localStorage.removeItem("i18nextLng");
  });
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Choose your language" }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "English" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Português" })).toBeVisible();

  await expect(page).toHaveScreenshot("first-run-language.png", {
    fullPage: true,
  });
});

for (const theme of THEMES) {
  test(`first-run connect step — ${theme}`, async ({ page, request }) => {
    await resetToFirstRun(request);
    await openManagerOnboarding(page);
    await expect(connectAiStep(page)).toBeVisible();
    await expect(subscriptionCard(page, "Claude")).toBeVisible();
    await pinTheme(page, theme);

    await expect(page).toHaveScreenshot(`first-run-connect-${theme}.png`, {
      fullPage: true,
    });
  });

  test(`first-run survey question — ${theme}`, async ({ page, request }) => {
    await resetToFirstRun(request);
    await openManagerOnboarding(page);
    await connectAi(page);
    await expect(managerStep(page, "survey-industry")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText("Signed in to OpenRouter")).toHaveCount(0, {
      timeout: 15_000,
    });
    await pinTheme(page, theme);

    await expect(page).toHaveScreenshot(`first-run-survey-${theme}.png`, {
      fullPage: true,
    });
  });
}
