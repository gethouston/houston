import type { Page } from "@playwright/test";
import { expect, test } from "../support/fixtures";

/**
 * The phone chat's composer chrome: opening a chat leaves the keyboard down,
 * and the toolbar under the composer (skills, mode, model, effort, context
 * ring) fits a narrow phone instead of running off the right edge.
 */

// Narrower than the project's Pixel 7 so the toolbar's row has to wrap.
test.use({ viewport: { width: 375, height: 667 } });

async function openTokyoChat(page: Page) {
  await page.goto("/");
  await page.getByTestId("agents-home-row").tap();
  await page
    .getByTestId("agent-missions-screen")
    .getByText("Plan a trip to Tokyo")
    .tap();
  const chat = page.getByTestId("mission-chat-screen");
  await expect(chat.getByText("Task: Plan a trip to Tokyo")).toBeVisible();
  return chat;
}

test("opening a chat leaves the composer unfocused (no keyboard)", async ({
  page,
}) => {
  const chat = await openTokyoChat(page);
  const composer = chat.getByPlaceholder("Send a follow-up...");
  await expect(composer).toBeVisible();
  // The desktop board focuses the composer as a chat opens; on a phone that
  // raises the keyboard over the log, so the phone must not.
  await expect(composer).not.toBeFocused();
  await expect(
    chat.getByText("Plan a trip to Tokyo", { exact: false }).first(),
  ).toBeVisible();
  await expect(composer).not.toBeFocused();
});

test("every toolbar control fits inside the phone viewport", async ({
  page,
}) => {
  const chat = await openTokyoChat(page);
  const toolbar = chat.getByTestId("composer-toolbar");
  await expect(toolbar).toBeVisible();
  await expect(toolbar.getByRole("button", { name: "Skills" })).toBeVisible();
  const ring = toolbar.getByRole("button", { name: "Context usage" });
  await expect(ring).toBeVisible();

  const width = page.viewportSize()?.width ?? 0;
  const buttons = await toolbar.getByRole("button").all();
  expect(buttons.length).toBeGreaterThanOrEqual(3);
  for (const button of buttons) {
    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    if (!box) continue;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
  }
  // Nothing forces the document wider than the phone.
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  // The ring opens its detail on a tap: a hover card never would on touch.
  await ring.tap();
  await expect(page.getByText("Context", { exact: true })).toBeVisible();
});
