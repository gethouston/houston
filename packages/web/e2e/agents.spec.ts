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
  await page.getByText("Start from scratch").click();

  await page.getByPlaceholder("e.g. Project Alpha").fill("Marketing Bot");
  await page.getByRole("button", { name: "Create Agent" }).click();

  // The new agent shows up (sidebar list + selected header both carry the name).
  await expect(page.getByText("Marketing Bot").first()).toBeVisible();
});
