import { expect, test } from "./support/fixtures";
import { openTeamSection } from "./support/team-nav";

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

/**
 * Press keys and report, per key, whether ANY handler called
 * `preventDefault()`.
 *
 * The shell's shortcut router listens on `window`, registered at mount; a
 * listener added now runs after it, so it observes the router's verdict. That
 * verdict is the whole question for a non-board surface: a prevented key is a
 * key the user does not get back.
 */
async function pressAndRecordPrevention(
  page: import("@playwright/test").Page,
  keys: string[],
): Promise<Record<string, boolean>> {
  await page.evaluate(() => {
    const seen: Record<string, boolean> = {};
    (window as unknown as { __keyPrevented: typeof seen }).__keyPrevented =
      seen;
    window.addEventListener("keydown", (e) => {
      seen[e.key] = e.defaultPrevented;
    });
    // Keys must reach the shell, not a focused control that would answer them.
    (document.activeElement as HTMLElement | null)?.blur();
  });
  for (const key of keys) await page.keyboard.press(key);
  return page.evaluate(
    () =>
      (window as unknown as { __keyPrevented: Record<string, boolean> })
        .__keyPrevented,
  );
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

test("a team's Routines section does not swallow the arrow keys or Enter", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("Your teams")).toBeVisible();

  // Visit the team's Mission Control first, exactly as a user would: its board
  // mounts, claims the arrow/Enter handlers, and then stays mounted behind the
  // section the user moves on to.
  await openTeamSection(page, "Mission Control");
  await expect(
    page.getByText("Plan a trip to Tokyo").filter({ visible: true }),
  ).toHaveCount(1);

  // Routines is the same `team` viewMode, so a VIEW-level board check still
  // reads "board here" and preventDefault()s every arrow and Enter. Nothing on
  // this screen has a highlight to move or a card to open, so the keys used to
  // vanish: no list scrolling, no Enter on whatever the user had focused.
  await openTeamSection(page, "Routines");
  await expect(
    page.getByRole("button", { name: "New routine" }).first(),
  ).toBeVisible();

  const prevented = await pressAndRecordPrevention(page, [
    "ArrowDown",
    "ArrowUp",
    "ArrowLeft",
    "ArrowRight",
    "Enter",
  ]);
  expect(prevented).toEqual({
    ArrowDown: false,
    ArrowUp: false,
    ArrowLeft: false,
    ArrowRight: false,
    Enter: false,
  });

  // And the board still owns them where a board really is on the glass, so the
  // narrowing did not just disable the feature.
  await openTeamSection(page, "Mission Control");
  await page.keyboard.press("ArrowRight");
  await expect(visibleHighlight(page)).toHaveCount(1);
});
