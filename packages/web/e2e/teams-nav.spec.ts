import { SEED_AGENT_ID } from "@houston/fake-host";
import { expect, test } from "./support/fixtures";
import { seedSidebarLayout } from "./support/sidebar-layout";

test("folder disclosure leaves the current screen in place", async ({
  page,
}) => {
  await seedSidebarLayout(page.request, {
    groups: [
      { id: "ops", name: "Ops", collapsed: false, agentIds: [SEED_AGENT_ID] },
    ],
    order: [],
  });
  await page.goto("/");
  const screen = page.locator('[data-screen-active="true"]');
  await expect(screen).toHaveAttribute("data-screen", "agent");
  const header = page
    .locator('[data-sidebar-group-header="ops"]')
    .locator('button[title="Ops"]');
  await header.click();
  await expect(header).toHaveAttribute("aria-expanded", "false");
  await expect(screen).toHaveAttribute("data-screen", "agent");
});
