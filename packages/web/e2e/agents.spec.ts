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

  // Switch back to the seeded agent → its mission returns.
  await rail(page)
    .getByRole("button", { name: "Houston", exact: true })
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

/**
 * HOU-708's rename contract: picking Rename swaps the rail row for an inline
 * field that arrives FOCUSED with the current name PRESELECTED, so the user
 * types the new name straight away. Both halves are asserted, the selection
 * included — "typing replaced it" would also pass on an empty field, which is
 * a different (lossy) product.
 */
test("renames an agent", async ({ page }) => {
  await page.goto("/");

  const row = rail(page);
  await row.getByRole("button", { name: "Agent menu" }).first().click();
  await page.getByRole("menuitem", { name: "Rename" }).click();

  // The rail's only textbox is the rename field (the agent search box is a
  // searchbox role), so this is unambiguous inside the rail.
  const input = row.getByRole("textbox");
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("Houston");
  // The whole existing name is selected, so the first keystroke replaces it.
  await expect
    .poll(() =>
      input.evaluate((el: HTMLInputElement) =>
        el.selectionStart === 0 && el.selectionEnd === el.value.length
          ? el.value
          : null,
      ),
    )
    .toBe("Houston");

  await page.keyboard.type("Mission Control Bot");
  await page.keyboard.press("Enter");

  await expect(row.getByText("Mission Control Bot").first()).toBeVisible();
});
