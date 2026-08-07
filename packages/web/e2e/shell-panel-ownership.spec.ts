import { expect, test } from "./support/fixtures";

/**
 * The ONE shell-level detail panel is shared by every surface that opens it
 * (the Activity board, the Routines chat, the Archived list, the skill /
 * integration setup chats). Every agent tab stays mounted, so "is the panel
 * open" cannot be a single last-writer-wins boolean: a tab that stops being
 * visible has to drop ITS claim on the panel without clobbering whatever the
 * newly-visible tab claims (PRODUCT-1229 — leaving the Routines tab with a
 * chat open left the panel painted as an empty card over the Activity board).
 */

test("leaving the Routines tab with its chat open closes the shared panel", async ({
  page,
}) => {
  await page.goto("/");

  // Activity first: the board owns the panel and nothing is selected, so the
  // panel is closed.
  await page.locator('[data-tour-target="tab-activity"]').click();
  await expect(page.getByTestId("mission-panel")).toBeHidden();

  // Routines: the create intake opens the shared panel.
  await page.locator('[data-tour-target="tab-routines"]').click();
  await page.getByRole("button", { name: "New routine" }).first().click();
  await expect(page.getByTestId("mission-panel")).toBeVisible();
  await expect(page.getByText("How do you want to start?")).toBeVisible();

  // Back to Activity: the routine chat no longer renders into the panel, so
  // the panel must close with it — never linger as an empty card.
  await page.locator('[data-tour-target="tab-activity"]').click();
  await expect(page.getByTestId("mission-panel")).toBeHidden();
});

test("leaving the Activity tab with a mission open closes the shared panel", async ({
  page,
}) => {
  await page.goto("/");

  // A mission chat claims the panel from the board side.
  await page.locator('[data-tour-target="tab-activity"]').click();
  await page.getByText("Plan a trip to Tokyo").first().click();
  await expect(page.getByTestId("mission-panel")).toBeVisible();

  // Routines has nothing selected, so nothing claims the panel and it closes —
  // the board's chat must not be left painted over the routines list.
  await page.locator('[data-tour-target="tab-routines"]').click();
  await expect(
    page.getByRole("button", { name: "New routine" }).first(),
  ).toBeVisible();
  await expect(page.getByTestId("mission-panel")).toBeHidden();

  // And returning to Activity does not resurrect a stale panel.
  await page.locator('[data-tour-target="tab-activity"]').click();
  await expect(page.getByTestId("mission-panel")).toBeHidden();
});

test("leaving a board with the new-mission composer open still lets it reopen", async ({
  page,
}) => {
  await page.goto("/");

  // Mission Control, with the EMPTY new-mission composer claiming the panel.
  // That composer's open state lives inside AIBoard, not in the app store, so
  // releasing the panel means calling the closer the board handed back — not
  // just dropping the app-side selection.
  await page.locator('[data-tour-target="nav-dashboard"]').click();
  await page.getByRole("button", { name: "New mission" }).first().click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Houston", exact: true })
    .click();
  await expect(page.getByTestId("mission-panel")).toBeVisible();

  // Off to another top-level view: the board goes off screen and lets go.
  await page.locator('[data-tour-target="nav-skills"]').click();
  await expect(page.getByTestId("mission-panel")).toBeHidden();

  // Back on the board, a mission card must be able to open the panel AGAIN.
  // Releasing only the app-side selection left AIBoard's own `showPanel` stuck
  // true, so its open-change effect never fired and this click did nothing.
  await page.locator('[data-tour-target="nav-dashboard"]').click();
  await page.getByText("Plan a trip to Tokyo").first().click();
  await expect(page.getByTestId("mission-panel")).toBeVisible();
});
