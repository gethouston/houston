/**
 * Visual baselines for the file preview (HOU-192): the desktop panel beside
 * the chat holding one comment (its chip in the composer, its mark and the
 * rail's count on the page), and the phone's full-screen sheet with the
 * one-time hint. Pages render through pdf.js from a hand-built PDF, so the
 * frame is the same on every run of a platform.
 */

import { expect, test } from "../support/fixtures";
import {
  PDF_FILE,
  PDF_MISSION_TITLE,
  seedChatWithPdf,
} from "../support/pdf-chat";
import { missionCard } from "../support/team-nav";
import { pinTheme, THEMES } from "./support";

const preview = (page: import("@playwright/test").Page) =>
  page.getByRole("region", { name: `Preview of ${PDF_FILE}` });

for (const theme of THEMES) {
  test(`file preview panel with a comment — ${theme}`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedChatWithPdf(request);
    await page.goto("/");
    await missionCard(page, PDF_MISSION_TITLE).click();
    await page.getByRole("button", { name: PDF_FILE }).click();
    const panel = preview(page);
    await expect(panel.locator(".pdf-page canvas").first()).toBeVisible();
    await expect(panel.locator(".pdf-thumb-canvas").first()).toBeVisible();

    const box = await panel.locator(".pdf-page").first().boundingBox();
    if (!box) throw new Error("the page has no box");
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.75, {
      steps: 8,
    });
    await page.mouse.up();
    await page
      .getByRole("textbox", { name: "What should the agent change?" })
      .fill("Make the chart bigger");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(
      page.getByRole("region", { name: "Comments for the agent" }),
    ).toBeVisible();
    await page.mouse.move(0, 0);
    await pinTheme(page, theme);

    await expect(page).toHaveScreenshot(`file-preview-panel-${theme}.png`);
  });

  test(`file preview phone sheet — ${theme}`, async ({ page, request }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedChatWithPdf(request);
    await page.goto("/");
    await page.getByTestId("agents-home-row").first().click();
    await page
      .getByTestId("agent-missions-screen")
      .getByText(PDF_MISSION_TITLE)
      .click();
    await page.getByRole("button", { name: PDF_FILE }).click();
    const panel = preview(page);
    await expect(panel.locator(".pdf-page canvas").first()).toBeVisible();
    await expect(panel.getByRole("note")).toBeVisible();
    await page.mouse.move(0, 0);
    await pinTheme(page, theme);

    await expect(page).toHaveScreenshot(`file-preview-phone-${theme}.png`);
  });
}
