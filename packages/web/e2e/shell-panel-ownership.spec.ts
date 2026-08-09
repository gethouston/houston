import { FAKE_HOST_URL, SEED_AGENT_ID } from "@houston/fake-host";
import { expect, test } from "./support/fixtures";
import { openTeamSection, screen } from "./support/team-nav";

/**
 * The ONE shell-level detail panel is shared by every surface that opens it
 * (a mission board, the Routines chat, the Archived list, the skill /
 * integration setup chats). Several kept-alive SCREENS are mounted at once, so
 * "is the panel open" cannot be a single last-writer-wins boolean: a surface
 * that stops being visible has to drop ITS claim without clobbering whatever
 * the newly-visible one claims (PRODUCT-1229 — leaving Routines with a chat
 * open left the panel painted as an empty card over the board).
 */

test("leaving the team's Routines with its chat open closes the shared panel", async ({
  page,
}) => {
  await page.goto("/");

  // Tasks first: the board owns the panel and nothing is selected,
  // so the panel is closed.
  await openTeamSection(page, "Tasks");
  await expect(page.getByTestId("mission-panel")).toBeHidden();

  // Routines: the create intake opens the shared panel.
  await openTeamSection(page, "Routines");
  await page.getByRole("button", { name: "New routine" }).first().click();
  await expect(page.getByTestId("mission-panel")).toBeVisible();
  await expect(page.getByText("How do you want to start?")).toBeVisible();

  // Back to the board: the routine chat no longer renders into the panel, so
  // the panel must close with it — never linger as an empty card.
  await openTeamSection(page, "Tasks");
  await expect(page.getByTestId("mission-panel")).toBeHidden();
});

test("leaving the team's board with a mission open closes the shared panel", async ({
  page,
}) => {
  await page.goto("/");

  // A mission chat claims the panel from the board side.
  await openTeamSection(page, "Tasks");
  await screen(page).getByText("Plan a trip to Tokyo").first().click();
  await expect(page.getByTestId("mission-panel")).toBeVisible();

  // Routines has nothing selected, so nothing claims the panel and it closes —
  // the board's chat must not be left painted over the routines list.
  await openTeamSection(page, "Routines");
  await expect(
    page.getByRole("button", { name: "New routine" }).first(),
  ).toBeVisible();
  await expect(page.getByTestId("mission-panel")).toBeHidden();

  // And returning to the board does not resurrect a stale panel.
  await openTeamSection(page, "Tasks");
  await expect(page.getByTestId("mission-panel")).toBeHidden();
});

test("leaving a board with the new-mission composer open still lets it reopen", async ({
  page,
}) => {
  await page.goto("/");

  // The team's board, with the EMPTY new-mission composer claiming the panel.
  // That composer's open state lives inside AIBoard, not in the app store, so
  // releasing the panel means calling the closer the board handed back — not
  // just dropping the app-side selection.
  await openTeamSection(page, "Tasks");
  // A one-agent team has nothing to ask: "New task" opens that agent's
  // composer straight away, with no picker in the way.
  await page.getByRole("button", { name: "New task" }).first().click();
  await expect(page.getByTestId("mission-panel")).toBeVisible();

  // Off to another top-level view: the team screen is only HIDDEN, never
  // unmounted, so the board goes off screen still holding its own state and
  // has to let go of the panel itself.
  await page.locator('[data-tour-target="nav-skills"]').click();
  await expect(page.getByTestId("mission-panel")).toBeHidden();

  // Back on the board, a mission card must be able to open the panel AGAIN.
  // Releasing only the app-side selection left AIBoard's own `showPanel` stuck
  // true, so its open-change effect never fired and this click did nothing.
  await openTeamSection(page, "Tasks");
  await screen(page).getByText("Plan a trip to Tokyo").first().click();
  await expect(page.getByTestId("mission-panel")).toBeVisible();
});

test("a team's routine chat lets go of the shared panel when the team leaves the glass", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/agents/${SEED_AGENT_ID}/routines`, {
    data: { name: "Morning brief", prompt: "p", schedule: "0 9 * * *" },
  });

  // Open the team's Routines section from the rail and select a routine: its
  // chat claims the ONE shell panel from a team SCREEN, not from a tab.
  await page.goto("/");
  await expect(page.getByText("Your teams")).toBeVisible();
  await openTeamSection(page, "Routines");
  const row = page
    .getByTestId("routine-row")
    .filter({ hasText: "Morning brief" });
  await row.click();
  await expect(page.getByTestId("mission-panel")).toBeVisible();
  await expect(page.getByText("Routine: Morning brief")).toBeVisible({
    timeout: 15_000,
  });

  // Off to another TOP-LEVEL view — the exit a section swap cannot model. The
  // whole team screen is hidden rather than unmounted, so its chat is still
  // mounted and has to release the panel itself; otherwise it stays painted
  // over whatever the user went to look at.
  await page.locator('[data-tour-target="nav-agent-store"]').click();
  await expect(page.getByTestId("mission-panel")).toBeHidden();

  // And back: the still-mounted chat takes the panel again, and the list still
  // says which routine is open. A section that quietly dropped its selection
  // on the way out would leave a lit-nothing list beside a full panel.
  await openTeamSection(page, "Routines");
  await expect(page.getByText("Routine: Morning brief")).toBeVisible({
    timeout: 15_000,
  });
  await expect(row).toHaveAttribute("aria-selected", "true");
});
