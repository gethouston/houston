import { SEED_AGENT_ID } from "@houston/fake-host";
import { expect, test } from "./support/fixtures";
import { seedSidebarLayout } from "./support/sidebar-layout";

test("a folder employee retains its own section tabs", async ({ page }) => {
  await seedSidebarLayout(page.request, {
    groups: [
      { id: "work", name: "Work", collapsed: false, agentIds: [SEED_AGENT_ID] },
    ],
    order: [],
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await page
    .locator(`[data-sidebar-item][data-item-id="${SEED_AGENT_ID}"]`)
    .getByRole("button")
    .first()
    .click();
  const tabs = page.locator(
    '[data-screen-active="true"] [data-team-section-tab]',
  );
  await expect(tabs).toHaveCount(4);
  await expect(tabs.nth(0)).toBeVisible();
});
