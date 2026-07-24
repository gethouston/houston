import { FAKE_HOST_URL } from "@houston/fake-host";
import { createAgent } from "./support/create-agent";
import { expect, test } from "./support/fixtures";

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
  await expect(page.getByText("Your Agents")).toBeVisible();

  await createAgent(page, "Marketing Bot");

  // Back in the shell, the new agent shows up in the sidebar.
  const sidebar = page.locator("[data-tour-target='agents']");
  await expect(sidebar.getByText("Marketing Bot").first()).toBeVisible();
});

/**
 * Switching agents swaps the board. Each agent has its own missions, so the
 * seeded agent's "Plan a trip to Tokyo" must vanish on a fresh agent and return
 * when we switch back. (The agent "Houston" button is `.last()` — kept in case
 * another "Houston" control appears above it in the sidebar.)
 */
test("switches between two agents", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Plan a trip to Tokyo")).toBeVisible();

  // Create a second agent; it becomes selected, with an empty board of its own.
  await createAgent(page, "Research Bot");
  await expect(page.getByText("Plan a trip to Tokyo")).toHaveCount(0);

  // Switch back to the seeded agent → its mission returns.
  await page
    .getByRole("button", { name: "Houston", exact: true })
    .last()
    .click();
  await expect(page.getByText("Plan a trip to Tokyo")).toBeVisible();
});

/**
 * HOU-858: switching agents must NEVER paint the previous agent's mission
 * cards while the next agent's board read is still in flight. The switch test
 * above can't catch a transient leak — its assertions auto-retry until the
 * (instant) live read lands — so this one makes the in-flight window
 * effectively permanent: the target agent's reads are held for 8s, and the
 * old agent's card must be gone (and the new agent's cached setup mission
 * painted from the sidebar aggregate) well inside that hold. Stale cards
 * previously leaked through `useActivity`'s `placeholderData(previousData)`.
 */
test("never shows the previous agent's missions while the next board read is in flight", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(page.getByText("Plan a trip to Tokyo")).toBeVisible();

  // A second agent whose board must be COLD when we later switch to it:
  // create it (which selects it and warms its board query), switch back to
  // the seeded agent, then reload. The default e2e token keeps query
  // persistence off, so the fresh page only loads the seeded agent's board
  // plus the all-conversations aggregate — "Research Bot"'s per-agent
  // activity key has no cache entry, exactly like an agent first visited
  // mid-session in production.
  await createAgent(page, "Research Bot");
  await page
    .getByRole("button", { name: "Houston", exact: true })
    .last()
    .click();
  await expect(page.getByText("Plan a trip to Tokyo")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Plan a trip to Tokyo")).toBeVisible();

  // Stall every per-agent read the way an asleep cloud pod does, then switch.
  await request.post(`${FAKE_HOST_URL}/__test__/hold-agent-reads`, {
    data: { ms: 8_000 },
  });
  await page
    .getByRole("button", { name: "Research Bot", exact: true })
    .last()
    .click();

  // Research Bot's setup mission paints immediately from the cached sidebar
  // aggregate — and the seeded agent's card is gone — while the live read is
  // still held (3s of grace, far under the 8s hold).
  await expect(page.getByText("Getting set up")).toBeVisible({
    timeout: 3_000,
  });
  await expect(page.getByText("Plan a trip to Tokyo")).toHaveCount(0, {
    timeout: 3_000,
  });
});

/**
 * Renaming via the (hover-gated) agent kebab → Rename. The menu items are
 * Rename / Change color / Export a copy / Delete; Rename focuses an inline
 * field, which we replace and submit.
 */
test("renames an agent", async ({ page }) => {
  await page.goto("/");

  const agent = page
    .getByRole("button", { name: "Houston", exact: true })
    .last();
  await agent.hover();
  await page.getByRole("button", { name: "Agent menu" }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();

  // Rename swaps the sidebar row for an inline text field (the search box is a
  // searchbox role, so this textbox is unambiguous). It must arrive focused
  // with the current name selected, so typing replaces it without another
  // click (HOU-708 follow-up).
  const input = page.getByRole("textbox");
  await expect(input).toBeFocused();
  await page.keyboard.type("Mission Control Bot");
  await page.keyboard.press("Enter");

  await expect(page.getByText("Mission Control Bot").first()).toBeVisible();
});
