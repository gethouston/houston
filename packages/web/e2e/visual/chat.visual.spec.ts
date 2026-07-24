/**
 * Visual-regression baselines for a chat conversation with messages.
 *
 * We open the seeded "Plan a trip to Tokyo" mission, send one follow-up, and
 * wait for the fake host's canned reply to SETTLE ("Roger that. You said: …")
 * before the pixel compare. Capturing only the settled state keeps this
 * deterministic: the streamed deltas and the typing caret are gone, the reply
 * text is a fixed echo of the prompt, and chat bubbles carry no timestamp
 * (verified in ui/chat/src — no relative-time rendering). `caret: "hide"`
 * (config-wide) also removes the composer's blinking text cursor.
 *
 * Both themes; determinism rules in ../README.md.
 */
import { expect, test } from "../support/fixtures";
import { pinTheme, THEMES } from "./support";

for (const theme of THEMES) {
  test(`chat conversation — ${theme}`, async ({ page }) => {
    await page.goto("/");

    await page.getByText("Plan a trip to Tokyo").click();
    const composer = page.getByPlaceholder("Send a follow-up...");
    await expect(composer).toBeVisible();

    await composer.fill("what about the budget?");
    await composer.press("Enter");

    // The user bubble and the fully-settled assistant reply are both on screen.
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
