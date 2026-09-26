import { SEED_AGENT_ID } from "@houston/fake-host";
import { newAgentRow } from "./support/create-agent";
import { expect, test } from "./support/fixtures";
import { seedSidebarLayout } from "./support/sidebar-layout";
import { litRows, navRow, rail, screen, teamTab } from "./support/team-nav";

/**
 * The whole harness in one spec: the full desktop UI boots in the browser, on
 * the host adapter (host mode), against the fake host — past the
 * engine Connect screen, the language picker, and the legal disclaimer — and the
 * files-first board data (`.houston/activity/activity.json`) flows through.
 *
 * It is also where the rail's shape is pinned. There is no global Mission
 * Control any more: the top-level rows are the ones that belong to nobody
 * (the Assistant, AI Models, Integrations), then "Your AI Employees" under the rail's
 * ONE band, with the Academy and Settings in the footer. Desktop opens the
 * first employee in that band once the roster and layout resolve.
 */
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

  // Shell chrome: the whole top-level rail, in the order the user reads it.
  const sidebar = page.locator("[data-tour-target='sidebar']");
  await expect(navRow(page, "ai-hub")).toBeVisible();
  await expect(navRow(page, "integrations")).toBeVisible();
  // The lead run wears no heading: "Your AI Employees" is the rail's only band.
  await expect(sidebar.getByText("Workspace", { exact: true })).toHaveCount(0);
  await expect(navRow(page, "settings")).toBeVisible();
  await expect(sidebar.getByText("Your AI Employees")).toBeVisible();
  await expect(newAgentRow(page)).toBeVisible();

  // The group header only folds; its first member is selected at boot.
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

  // The board rendered with its three columns + the seeded missions (proves the
  // files-first data path works end-to-end).
  await expect(screen(page).getByText("Running")).toBeVisible();
  await expect(screen(page).getByText("Needs you")).toBeVisible();
  await expect(screen(page).getByText("Done", { exact: true })).toBeVisible();
  await expect(screen(page).getByText("Plan a trip to Tokyo")).toBeVisible();

  // None of the boot gates are left on screen.
  await expect(
    page.getByText(
      /Connecting to engine|Loading your workspace|Language · Idioma|Can't reach the engine/i,
    ),
  ).toHaveCount(0);
});
