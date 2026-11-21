import { SEED_AGENT_ID } from "@houston/fake-host";
import { newAgentButton } from "./support/create-agent";
import { expect, test } from "./support/fixtures";
import { seedSidebarLayout } from "./support/sidebar-layout";
import { litRows, navRow, rail, screen, teamTab } from "./support/team-nav";
import {
  openWorkspaceMenu,
  railDestination,
  workspaceMenuTrigger,
} from "./support/workspace-menu";

test("boots past every gate onto the first employee's Tasks", async ({
  page,
}) => {
  await seedSidebarLayout(page.request, {
    groups: [
      { id: "home", name: "Home", collapsed: false, agentIds: [SEED_AGENT_ID] },
    ],
    order: [],
  });
  await page.goto("/");

  const sidebar = page.locator("[data-tour-target='sidebar']");
  await expect(sidebar.getByTestId("rail-search")).toBeVisible();
  await expect(newAgentButton(page)).toBeVisible();
  await expect(sidebar.getByText("Workspace", { exact: true })).toHaveCount(0);
  await expect(workspaceMenuTrigger(page)).toBeVisible();
  await expect(sidebar.getByTestId("rail-add-employee")).toBeVisible();
  await expect(railDestination(page, "nav-integrations")).toHaveAccessibleName(
    "Connect your apps",
  );
  await expect(railDestination(page, "nav-ai-hub")).toHaveAccessibleName(
    "Connect your AI",
  );
  const menu = await openWorkspaceMenu(page);
  await expect(navRow(page, "academy")).toBeVisible();
  await expect(navRow(page, "settings")).toBeVisible();
  for (const id of ["ai-hub", "integrations"]) {
    await expect(menu.locator(`[data-tour-target='nav-${id}']`)).toHaveCount(0);
  }
  await page.keyboard.press("Escape");

  await expect(
    litRows(rail(page).locator('[data-sidebar-group-header="home"]')),
  ).toHaveCount(0);
  await expect(
    litRows(
      rail(page).locator(
        `[data-sidebar-item][data-item-id="${SEED_AGENT_ID}"]`,
      ),
    ),
  ).toHaveCount(1);
  await expect(screen(page)).toHaveAttribute("data-screen", "agent");
  await expect(teamTab(page, "Tasks")).toHaveAttribute("aria-current", "page");

  await expect(screen(page).getByText("Running")).toBeVisible();
  await expect(screen(page).getByText("Needs you")).toBeVisible();
  await expect(screen(page).getByText("Done", { exact: true })).toBeVisible();
  await expect(screen(page).getByText("Plan a trip to Tokyo")).toBeVisible();

  await expect(
    page.getByText(
      /Connecting to engine|Loading your workspace|Language · Idioma|Can't reach the engine/i,
    ),
  ).toHaveCount(0);
});
