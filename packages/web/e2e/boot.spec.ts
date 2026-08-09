import { expect, test } from "./support/fixtures";
import { litRows, navRow, rail, screen, teamTab } from "./support/team-nav";

/**
 * The whole harness in one spec: the full desktop UI boots in the browser, on
 * the host adapter (host mode), against the fake host — past the
 * engine Connect screen, the language picker, and the legal disclaimer — and the
 * files-first board data (`.houston/activity/activity.json`) flows through.
 *
 * It is also where the rail's shape is pinned. There is no global Mission
 * Control any more: the top-level rows are the two that belong to nobody
 * (Inbox, Agent Store), then the "My accounts" and "Workspace" bands, then
 * "Your teams" — and boot lands on the FIRST team's Tasks board.
 */
test("boots past every gate onto the first team's Tasks board", async ({
  page,
}) => {
  await page.goto("/");

  // Shell chrome: the whole top-level rail, in the order the user reads it.
  const sidebar = page.locator("[data-tour-target='sidebar']");
  await expect(navRow(page, "inbox")).toBeVisible();
  await expect(navRow(page, "agent-store")).toBeVisible();
  await expect(sidebar.getByText("My accounts")).toBeVisible();
  await expect(navRow(page, "integrations")).toBeVisible();
  await expect(sidebar.getByText("Workspace", { exact: true })).toBeVisible();
  // Single player: the solo user IS the space owner, so Skills is theirs.
  await expect(navRow(page, "skills")).toBeVisible();
  await expect(navRow(page, "settings")).toBeVisible();
  await expect(sidebar.getByText("Your teams")).toBeVisible();
  await expect(page.getByRole("button", { name: "New agent" })).toBeVisible();

  // The board a user lands on is a TEAM's, and the two halves of the chrome say
  // so between them. The RAIL says which team: its block is a name and its
  // agents, so the block's own header is the row that lights — and it lights
  // rather than one of its agents, because boot pins nobody. The SCREEN says
  // which section: the team's own lozenge is the board's door, and it is the
  // one wearing `aria-current`.
  await expect(
    litRows(rail(page).locator("[data-sidebar-default-header]")),
  ).toHaveCount(1);
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
