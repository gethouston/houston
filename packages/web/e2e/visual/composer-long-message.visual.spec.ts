/**
 * Visual baselines for the composer holding a message longer than its box: the
 * resize grip keeps its own row above the first line, and the text keeps a
 * gutter before the scrollbar (HOU-180). The caret sits at the end after
 * `fill`, so the box is scrolled to its bottom every run; `caret: "hide"`
 * (config-wide) removes the blinking cursor.
 *
 * Both themes; determinism rules in ../README.md.
 */

import { FOLLOW_UP_PLACEHOLDER } from "../support/composer";
import { expect, test } from "../support/fixtures";
import { missionCard } from "../support/team-nav";
import { pinTheme, THEMES } from "./support";

const LONG_MESSAGE = Array.from(
  { length: 12 },
  (_, i) =>
    `Line ${i + 1}: check whether the message box grows taller when a message is too long to fit, and keeps the text clear of its edges.`,
).join(" ");

for (const theme of THEMES) {
  test(`composer with a long message — ${theme}`, async ({ page }) => {
    await page.goto("/");

    await missionCard(page, "Plan a trip to Tokyo").click();
    const composer = page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER);
    await expect(composer).toBeVisible();
    await composer.fill(LONG_MESSAGE);
    await pinTheme(page, theme);

    const surface = page.locator("[data-composer-surface][data-expanded]");
    await expect(surface).toBeVisible();
    await expect(surface).toHaveScreenshot(`composer-long-${theme}.png`);
  });
}
