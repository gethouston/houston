import { createAgent } from "./support/create-agent";
import { expect, test } from "./support/fixtures";
import { rail, screen } from "./support/team-nav";

/**
 * Agent lifecycle through the UI. Creating an agent goes New agent → From
 * scratch → name + create, which POSTs to the fake host's `/agents`, fires the
 * agent's self-setup mission, and auto-opens its chat panel (dismissed by the
 * shared `createAgent` helper), landing the new agent in the sidebar (via the
 * AgentsChanged reactivity event).
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

  // Create a second agent; it becomes selected, with an empty board of its own.
  await createAgent(page, "Research Bot");
  await expect(screen(page).getByText("Plan a trip to Tokyo")).toHaveCount(0);

  // Switch back to the seeded agent → its mission returns. Anchored rather than
  // exact: an agent row may still carry a quiet unread mark inside its button,
  // which joins the accessible name. The needs-you COUNT is gone from the rail
  // entirely — a rail says what exists and where you are, not the score.
  await rail(page)
    .getByRole("button", { name: /^Houston\b/ })
    .click();
  await expect(screen(page).getByText("Plan a trip to Tokyo")).toBeVisible();
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
