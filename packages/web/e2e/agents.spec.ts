import { expect, test } from "./support/fixtures";

/**
 * Agent lifecycle through the UI. Creating an agent goes New agent → Start from
 * scratch → name + create, which POSTs to the fake host's `/agents` and lands
 * the new agent in the sidebar (via the AgentsChanged reactivity event).
 */
test("creates an agent and shows it in the sidebar", async ({ page }) => {
  await page.goto("/");

  // Sidebar starts with the one seeded agent.
  await expect(page.getByText("Your Agents")).toBeVisible();

  await page.getByRole("button", { name: "New agent" }).click();
  await page.getByText("From scratch").click();

  await page.getByPlaceholder("e.g. Project Alpha").fill("Marketing Bot");
  await page.getByRole("button", { name: "Create Agent" }).click();

  // The new agent shows up (sidebar list + selected header both carry the name).
  await expect(page.getByText("Marketing Bot").first()).toBeVisible();
});

/**
 * Switching agents swaps the board. Each agent has its own missions, so the
 * seeded agent's "Plan a trip to Tokyo" must vanish on a fresh agent and return
 * when we switch back. (The agent "Houston" button is `.last()` — the first
 * "Houston" button is the workspace switcher at the top of the sidebar.)
 */
test("switches between two agents", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Plan a trip to Tokyo")).toBeVisible();

  // Create a second agent; it becomes selected, with an empty board of its own.
  await page.getByRole("button", { name: "New agent" }).click();
  await page.getByText("From scratch").click();
  await page.getByPlaceholder("e.g. Project Alpha").fill("Research Bot");
  await page.getByRole("button", { name: "Create Agent" }).click();

  await expect(page.getByText("Research Bot").first()).toBeVisible();
  await expect(page.getByText("Plan a trip to Tokyo")).toHaveCount(0);

  // Switch back to the seeded agent → its mission returns.
  await page
    .getByRole("button", { name: "Houston", exact: true })
    .last()
    .click();
  await expect(page.getByText("Plan a trip to Tokyo")).toBeVisible();
});

/**
 * Renaming via the (hover-gated) agent kebab → Rename. The menu items are
 * Rename / Change color / Share with a friend / Delete; Rename focuses an inline
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
