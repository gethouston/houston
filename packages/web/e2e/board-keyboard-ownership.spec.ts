import { expect, test } from "./support/fixtures";

/**
 * WHO owns the board keyboard when several boards are alive at once.
 *
 * Mission Control and every team's Mission Control are kept-alive top-level
 * screens: once visited they stay mounted, hidden behind `display: none`. Each
 * of them mounts a mission board, and a board claims the arrow-key navigator
 * and the Enter opener by publishing callbacks into the UI store — a single
 * slot, so every registration is last-writer-wins.
 *
 * That makes the claim a correctness rule rather than a detail: only the board
 * actually ON SCREEN may hold it. A hidden board that keeps the slot moves a
 * highlight ring inside its own invisible screen, and the user's arrow key
 * does nothing they can see.
 */

/** The kanban card wearing the arrow-key highlight ring, on screen. */
function visibleHighlight(page: import("@playwright/test").Page) {
  return page.locator("[data-highlighted]:visible");
}

test("the visible board owns the arrow keys, not a kept-alive team board", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("Your teams")).toBeVisible();

  // Both boards carry the same seeded mission, and a hidden screen keeps its
  // copy in the DOM — so every "the board is up" check counts the VISIBLE one.
  const onScreenMission = page
    .getByText("Plan a trip to Tokyo")
    .filter({ visible: true });

  // The global Mission Control board mounts and registers its handlers.
  const nav = page.locator("[data-tour-target='nav-dashboard']");
  await nav.click();
  await expect(onScreenMission).toHaveCount(1);

  // A team's Mission Control mounts a SECOND board. It is the later mount, so
  // an unguarded registration leaves it holding the slot for good.
  await page
    .locator("[data-tour-target='agents']")
    .locator("[data-sidebar-section-row]")
    .filter({ hasText: "Mission Control" })
    .first()
    .click();
  await expect(onScreenMission).toHaveCount(1);
  await expect(page.getByText("Plan a trip to Tokyo")).toHaveCount(2);

  // Back to the global board. The team screen is only hidden, never unmounted.
  await nav.click();
  await expect(onScreenMission).toHaveCount(1);

  // One arrow key: exactly one highlight, and it is on screen. Before the fix
  // the count was 0 — the hidden team board had highlighted a card inside its
  // own `display: none` screen.
  await page.keyboard.press("ArrowRight");
  await expect(visibleHighlight(page)).toHaveCount(1);

  // And the follow-through: Enter opens the shared panel on the mission the
  // ring is actually sitting on, which is a mission of the VISIBLE board.
  const title = await visibleHighlight(page).locator("p").first().innerText();
  expect(title.trim()).not.toEqual("");
  await page.keyboard.press("Enter");
  const panel = page.getByTestId("mission-panel");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText(title.trim());
});
