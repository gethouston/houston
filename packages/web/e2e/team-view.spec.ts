import { SEED_AGENT_ID } from "@houston/fake-host";
import { expect, test } from "./support/fixtures";
import { seedSidebarLayout } from "./support/sidebar-layout";

test("a folder header only folds its employee rows", async ({ page }) => {
  await seedSidebarLayout(page.request, {
    groups: [
      {
        id: "design",
        name: "Design",
        collapsed: false,
        agentIds: [SEED_AGENT_ID],
      },
    ],
    order: [],
  });
  await page.goto("/");
  const folder = page.locator('[data-sidebar-group-header="design"]');
  // By title, not by name: folded, the header carries its hidden members'
  // needs-you chip, and the chip joins the accessible name.
  const header = folder.locator('button[title="Design"]');
  const row = page.locator(
    `[data-sidebar-item][data-item-id="${SEED_AGENT_ID}"]`,
  );
  await expect(header).toHaveAttribute("aria-expanded", "true");
  await expect(row).toBeVisible();
  await expect(page.locator('[data-screen-active="true"]')).toHaveAttribute(
    "data-screen",
    "agent",
  );
  await expect(header).toHaveAccessibleName("Design");
  await header.click();
  await expect(header).toHaveAttribute("aria-expanded", "false");
  await expect(row).toHaveCount(0);
  await expect(header).toHaveAccessibleName("Design 1 issue needs you");
  await expect(page.locator('[data-screen-active="true"]')).toHaveAttribute(
    "data-screen",
    "agent",
  );
  await header.click();
  await row.getByRole("button").first().click();
  await expect(page.locator('[data-screen-active="true"]')).toHaveAttribute(
    "data-screen",
    "agent",
  );
});
