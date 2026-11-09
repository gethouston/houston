import type { Page } from "@playwright/test";
import { expect, test } from "../support/fixtures";
import {
  PDF_FILE,
  PDF_MISSION_TITLE,
  seedChatWithPdf,
} from "../support/pdf-chat";

/**
 * HOU-192 on the phone: a file opened from a chat is a full-screen sheet in
 * the navigation stack, so back closes it. A long press and drag marks an
 * area; the comment is asked for in a bottom sheet; "Back to chat" returns to
 * the composer holding the chip.
 */

async function openPdfFromChat(page: Page) {
  await page.goto("/");
  await page.getByTestId("agents-home-row").first().tap();
  await page
    .getByTestId("agent-missions-screen")
    .getByText(PDF_MISSION_TITLE)
    .tap();
  await page.getByRole("button", { name: PDF_FILE }).tap();
  const sheet = page.getByRole("region", { name: `Preview of ${PDF_FILE}` });
  await expect(sheet.locator(".pdf-page canvas").first()).toBeVisible();
  return sheet;
}

/** Hold still past the long-press delay, then drag: touch events through
 *  CDP, since Playwright's touchscreen only taps. */
async function longPressDrag(page: Page) {
  const box = await page.locator(".pdf-page").first().boundingBox();
  if (!box) throw new Error("the page has no box");
  const cdp = await page.context().newCDPSession(page);
  const at = (fx: number, fy: number) => [
    { x: box.x + box.width * fx, y: box.y + box.height * fy },
  ];
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: at(0.2, 0.5),
  });
  // The hold IS the gesture: stillness past the 380 ms long-press delay.
  await page.waitForTimeout(500);
  for (let i = 1; i <= 8; i++)
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: at(0.2 + i * 0.05, 0.5 + i * 0.03),
    });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
}

test("the preview is a sheet back closes, over the chat it came from", async ({
  page,
  request,
}) => {
  await seedChatWithPdf(request);
  const sheet = await openPdfFromChat(page);
  const box = await sheet.boundingBox();
  const viewport = page.viewportSize();
  expect(box?.width).toBe(viewport?.width);

  await page.goBack();
  await expect(sheet).toBeHidden();
  await expect(page.getByText(`Task: ${PDF_MISSION_TITLE}`)).toBeVisible();
});

test("a long press marks an area and the comment waits in the chat", async ({
  page,
  request,
}) => {
  await seedChatWithPdf(request);
  const sheet = await openPdfFromChat(page);
  await longPressDrag(page);

  const editor = page.getByRole("textbox", {
    name: "What should the agent change?",
  });
  await expect(editor).toBeVisible();
  await editor.fill("Bigger chart");
  await page.getByRole("button", { name: "Add", exact: true }).tap();

  const ready = sheet.getByRole("button", { name: /1 comment ready/ });
  await expect(ready).toBeVisible();
  await ready.tap();
  await expect(sheet).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Comment 1 on Page 1: Bigger chart" }),
  ).toBeVisible();
});
