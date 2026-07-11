import { createAgent } from "./support/create-agent";
import { expect, test } from "./support/fixtures";

/**
 * HOU-708 repro: changing an agent's color from the sidebar kebab menu.
 * Color is a client-side overlay (localStorage `houston.web.cp.agentColors`);
 * picking a swatch must update the sidebar avatar's fill immediately.
 */
test("changes agent color from the sidebar menu", async ({ page }) => {
  await page.goto("/");

  const agent = page
    .getByRole("button", { name: "Houston", exact: true })
    .last();
  await agent.hover();
  await page.getByRole("button", { name: "Agent menu" }).click();

  // Open the Change color submenu and pick Navy.
  await page.getByRole("menuitem", { name: "Change color" }).hover();
  await page.getByRole("menuitemradio", { name: "Navy" }).click();

  // The overlay must record the pick...
  await expect
    .poll(async () =>
      page.evaluate(() =>
        window.localStorage.getItem("houston.web.cp.agentColors"),
      ),
    )
    .toContain("navy");

  // ...and the sidebar avatar must repaint with the navy var.
  const helmet = agent.locator("svg").first();
  await expect(helmet).toHaveAttribute("style", /ht-agent-navy/);
});

/** The Share menu item opens the export wizard dialog. */
test("opens the share wizard from the sidebar menu", async ({ page }) => {
  await page.goto("/");

  const agent = page
    .getByRole("button", { name: "Houston", exact: true })
    .last();
  await agent.hover();
  await page.getByRole("button", { name: "Agent menu" }).click();
  await page.getByRole("menuitem", { name: "Export a copy" }).click();

  await expect(page.getByText("What should we export?")).toBeVisible();
});

/** Deleting an agent from the sidebar menu removes it from the list. */
test("deletes an agent from the sidebar menu", async ({ page }) => {
  await page.goto("/");

  // Create a second agent to delete (never delete the only one).
  await createAgent(page, "Doomed Bot");

  const doomed = page
    .getByRole("button", { name: "Doomed Bot", exact: true })
    .last();
  await doomed.hover();
  // Scope to Doomed Bot's own row — every agent row has an "Agent menu" button.
  await doomed
    .locator("..")
    .getByRole("button", { name: "Agent menu" })
    .click();
  await page.getByRole("menuitem", { name: "Delete" }).click();

  // Confirm dialog.
  await page.getByRole("button", { name: "Delete" }).click();

  await expect(page.getByText("Doomed Bot")).toHaveCount(0);
});
