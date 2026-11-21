import { FOLLOW_UP_PLACEHOLDER } from "../support/composer";
import { expect, test } from "../support/fixtures";
import { missionCard } from "../support/team-nav";
import { pinTheme, THEMES } from "./support";

test.use({ viewport: { width: 1280, height: 1550 } });

const USER_MARKDOWN = [
  "## Can you show me **markdown**?",
  "Headings, lists, and `code`, please.",
].join("\n");

for (const theme of THEMES) {
  test(`chat markdown scale — ${theme}`, async ({ page }) => {
    await page.goto("/");

    await missionCard(page, "Plan a trip to Tokyo").click();
    const composer = page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER);
    await expect(composer).toBeVisible();

    await composer.fill(USER_MARKDOWN);
    await composer.press("Enter");

    await expect(
      page.getByText("## Can you show me **markdown**?"),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Can you show me markdown?" }),
    ).not.toBeVisible();
    await expect(page.getByText("That is the whole plan.")).toBeVisible({
      timeout: 15_000,
    });
    await pinTheme(page, theme);

    await expect(page).toHaveScreenshot(`chat-markdown-${theme}.png`, {
      fullPage: true,
    });
  });
}
