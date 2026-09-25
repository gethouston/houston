import { FOLLOW_UP_PLACEHOLDER } from "./support/composer";
import { createAgent } from "./support/create-agent";
import { expect, test } from "./support/fixtures";
import { missionCard, rail, screen } from "./support/team-nav";

/**
 * Agent lifecycle through the UI. Creating an agent goes New AI Employee → the
 * guided brief → name + create, which POSTs to the fake host's `/agents` and
 * lands the new agent in the sidebar (via the AgentsChanged reactivity event).
 * Its first day waits for the user: nothing starts until the board's
 * "Start <name>'s first day" button is pressed.
 */
test("creates an agent and shows it in the sidebar", async ({ page }) => {
  await page.goto("/");

  // Sidebar starts with the one seeded agent.
  await expect(page.getByText("Your teams")).toBeVisible();

  await createAgent(page, "Marketing Bot");

  // Back in the shell, the new agent shows up in the sidebar.
  const sidebar = page.locator("[data-tour-target='agents']");
  await expect(sidebar.getByText("Marketing Bot").first()).toBeVisible();
});

/**
 * Clicking an agent in the rail opens ITS team's board, narrowed to it — so the
 * seeded agent's "Plan a trip to Tokyo" must vanish on a fresh agent and return
 * when we switch back. Lookups are scoped to the screen ON THE GLASS: every
 * top-level view is kept alive, so the (hidden) global board holds the same
 * cards.
 */
test("switches between two agents", async ({ page }) => {
  await page.goto("/");
  await expect(screen(page).getByText("Plan a trip to Tokyo")).toBeVisible();

  // Create a second agent; it becomes selected, its board holding only the
  // start of its first day.
  await createAgent(page, "Research Bot");
  await expect(screen(page).getByText("Plan a trip to Tokyo")).toHaveCount(0);
  await expect(
    screen(page).getByRole("button", {
      name: "Start Research Bot's first day",
    }),
  ).toBeVisible();

  // Switch back to the seeded agent → its mission returns. Anchored rather than
  // exact: an agent row may still carry a quiet unread mark inside its button,
  // which joins the accessible name. The needs-you COUNT is gone from the rail
  // entirely — a rail says what exists and where you are, not the score.
  await rail(page)
    .getByRole("button", { name: /^Houston\b/ })
    .click();
  await expect(screen(page).getByText("Plan a trip to Tokyo")).toBeVisible();
});

/**
 * A new hire's board IS its start button: pressing it creates the setup task,
 * opens its chat beside the board, and takes the button away for good.
 */
test("starts a new AI Employee's first day from its board", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("Your teams")).toBeVisible();

  await createAgent(page, "Ops Bot");
  const start = screen(page).getByRole("button", {
    name: "Start Ops Bot's first day",
  });
  await expect(start).toBeVisible();

  await start.click();
  await expect(page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER)).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByText("Task: Getting set up")).toBeVisible();
  await expect(missionCard(page, "Getting set up")).toBeVisible();
  await expect(start).toHaveCount(0);
});

/*
 * REMOVED with the per-agent board (the teams cutover): "never shows the
 * previous agent's missions while the next board read is in flight".
 *
 * That guarded `useActivity`'s `placeholderData(previousData)` leaking one
 * agent's cards into the next agent's board while its own read was held. There
 * is no per-agent board and no per-agent board read any more: switching agents
 * moves a FILTER over the one warm cross-agent sweep, so there is no in-flight
 * window for a stale card to survive in. The behaviour the test protected is
 * gone with the code that could break it.
 */

/*
 * REMOVED with the agent row's "..." menu: "renames an agent" (HOU-708's
 * focused-and-preselected inline field).
 *
 * An agent is renamed, recoloured, moved and deleted on its team's Manage
 * agents page now — the same page that configures it — so the rail offers none
 * of those and carries no menu to reach them from. The rename contract still
 * exists and still deserves this test; it belongs to that page's spec, not to
 * one about the rail.
 */
