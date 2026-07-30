/**
 * Visual-regression baselines for markdown inside chat bubbles (HOU-1051).
 *
 * Both roles render markdown: the USER bubble gets a real heading + emphasis +
 * inline code (typed into the composer as multi-line text), and the fake host
 * answers with its fixed MARKDOWN_SHOWCASE (triggered by "markdown" in the
 * prompt) — every heading level, a list, inline code, and a link. This is the
 * baseline that pins the chat type scale: Streamdown's document-size headings
 * are retuned in `ui/chat` (h1 20px … h4-h6 14px), and any drift there shows up
 * here first.
 *
 * Settle rule: the showcase's fixed closing sentence must be on screen before
 * the pixel compare, so no streaming delta or caret is in the frame. Both
 * themes; determinism rules in ../README.md.
 */
import { expect, test } from "../support/fixtures";
import { pinTheme, THEMES } from "./support";

const USER_MARKDOWN = [
  "## Can you show me **markdown**?",
  "Headings, lists, and `code`, please.",
].join("\n");

for (const theme of THEMES) {
  test(`chat markdown scale — ${theme}`, async ({ page }) => {
    await page.goto("/");

    await page.getByText("Plan a trip to Tokyo").click();
    const composer = page.getByPlaceholder("Send a follow-up...");
    await expect(composer).toBeVisible();

    await composer.fill(USER_MARKDOWN);
    await composer.press("Enter");

    // The user bubble rendered its heading, and the showcase reply settled
    // (its fixed last line is only published with the final delta).
    await expect(
      page.getByRole("heading", { name: "Can you show me markdown?" }),
    ).toBeVisible();
    await expect(page.getByText("That is the whole plan.")).toBeVisible({
      timeout: 15_000,
    });
    await pinTheme(page, theme);

    await expect(page).toHaveScreenshot(`chat-markdown-${theme}.png`, {
      fullPage: true,
    });
  });
}
