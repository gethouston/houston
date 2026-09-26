import { SEED_AGENT_ID } from "@houston/fake-host";
import { expect, test } from "./support/fixtures";
import { seedSidebarLayout } from "./support/sidebar-layout";

test("an employee in a folder has Routines and Files sections", async ({
  page,
}) => {
  await seedSidebarLayout(page.request, {
    groups: [
      { id: "work", name: "Work", collapsed: false, agentIds: [SEED_AGENT_ID] },
    ],
    order: [],
  });
  await page.goto("/");
  await page
    .locator(`[data-sidebar-item][data-item-id="${SEED_AGENT_ID}"]`)
    .getByRole("button")
    .first()
    .click();
  const screen = page.locator('[data-screen-active="true"]');
  await screen.locator('[data-team-section-tab="routines"]').click();
  await expect(screen).toContainText("Routines");
  await screen.locator('[data-team-section-tab="files"]').click();
  await expect(screen).toContainText("Files");
});
