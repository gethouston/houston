import { FOLLOW_UP_PLACEHOLDER } from "../support/composer";
import { expect, test } from "../support/fixtures";
import { missionCard } from "../support/team-nav";
import { pinTheme, THEMES } from "./support";

for (const theme of THEMES) {
  test(`chat conversation — ${theme}`, async ({ page }) => {
    await page.goto("/");

    await missionCard(page, "Plan a trip to Tokyo").click();
    const composer = page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER);
    await expect(composer).toBeVisible();

    await composer.fill("what about the budget?");
    await composer.press("Enter");

    await expect(
      page.getByText("what about the budget?").first(),
    ).toBeVisible();
    await expect(page.getByText(/Roger that\. You said:/)).toBeVisible({
      timeout: 15_000,
    });
    await pinTheme(page, theme);

    await expect(page).toHaveScreenshot(`chat-${theme}.png`, {
      fullPage: true,
    });
  });
}
