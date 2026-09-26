import { SEED_AGENT_ID } from "@houston/fake-host";
import { expect, test } from "./support/fixtures";
import { readSidebarLayout, seedSidebarLayout } from "./support/sidebar-layout";
import { rail } from "./support/team-nav";

test("a person's team folder is served as SidebarLayout", async ({ page }) => {
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
  await expect(
    page.locator('[data-sidebar-group-header="design"]'),
  ).toBeVisible();
  await expect(rail(page).getByText("Your AI Employees")).toBeVisible();
  expect((await readSidebarLayout(page.request)).groups[0].agentIds).toEqual([
    SEED_AGENT_ID,
  ]);
});
