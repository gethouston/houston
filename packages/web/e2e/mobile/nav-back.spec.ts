import { expect, test } from "../support/fixtures";

/**
 * Hardware/browser back on a phone: on Android
 * (and in an installed PWA) back is the primary way out of a screen, so it
 * must pop the app's navigation stack — here the full-screen chat overlay —
 * instead of leaving the app.
 */

test("back closes the full-screen chat instead of leaving the app", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByText("Plan a trip to Tokyo").tap();
  await expect(page.getByText("Task: Plan a trip to Tokyo")).toBeVisible();

  await page.goBack();
  await expect(page.getByTestId("mission-panel")).toBeHidden();
  // Still in the app, on the board the chat covered.
  await expect(page.getByText("Plan a trip to Tokyo")).toBeVisible();
});
