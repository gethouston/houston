import { FAKE_HOST_URL } from "@houston/fake-host";
import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";

/**
 * The sidebar is a list of TEAMS. Every block — a named team and the trailing
 * DEFAULT team, which is the workspace itself — draws the same anatomy: a name,
 * the destinations that team offers, then its agents.
 *
 * What this spec guards, against the REAL rail:
 *   - the default block is labelled with the WORKSPACE name (the fake host's
 *     seed workspace is `default`) and offers no fold / rename / menu, because
 *     it is the container rather than a stored group;
 *   - Mission Control, Routines and Files are present on EVERY team, always —
 *     they show the team's WORK, so they are every member's;
 *   - Team Settings follows `canSeeTeamSettings`: present single-player and for
 *     a multiplayer owner, absent for a plain multiplayer member, because it is
 *     the one section that CONFIGURES rather than shows;
 *   - selecting a destination or an agent lights exactly one row.
 *
 * Assertions are deliberately SIDEBAR-side (the row that is lit) rather than
 * about what the team view renders — the rail's contract is "say where the user
 * is", and the view has its own specs. Drag behavior lives in
 * `sidebar-dnd.spec.ts`.
 */

const OWNER_CAPS = { multiplayer: true, teams: true, role: "owner" };
const MEMBER_CAPS = { multiplayer: true, teams: true, role: "user" };

async function armCapabilities(
  request: APIRequestContext,
  caps: Record<string, unknown>,
): Promise<void> {
  await request.post(`${FAKE_HOST_URL}/__test__/capabilities`, { data: caps });
}

function rail(page: Page): Locator {
  return page.locator("[data-tour-target='agents']");
}

function sectionRows(page: Page, label: string): Locator {
  return rail(page)
    .locator("[data-sidebar-section-row]")
    .filter({ hasText: label });
}

/**
 * The agent row that says "you are here", by agent name. Read off
 * `aria-current="page"` — the same marker a destination row wears — rather than
 * a Tailwind paint utility, so the assertion is about what the rail MEANS and a
 * repaint cannot break a navigation test.
 */
function litAgentRow(page: Page, name: string): Locator {
  return rail(page)
    .locator("[data-sidebar-item]")
    .filter({ hasText: name })
    .locator("[aria-current='page']");
}

/** Create a named team through the real folder affordance + inline rename. */
async function createTeam(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: "New team" }).click();
  const input = page.getByPlaceholder("Team name");
  await input.waitFor({ state: "visible" });
  await input.fill(name);
  await input.press("Enter");
  await expect(rail(page).getByText(name, { exact: true })).toBeVisible();
}

test("the default block is the workspace, and every team offers the work sections", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("Your teams")).toBeVisible();

  // The trailing block wears the WORKSPACE's name, not an anonymous label —
  // read off the switcher rather than hard-coded, since that identity is the
  // actual invariant ("the default team is the workspace").
  const workspaceName = (
    await page.locator("[data-tour-target='spaceSwitcher']").innerText()
  ).trim();
  expect(workspaceName).not.toEqual("");
  const defaultHeader = page.locator("[data-sidebar-default-header]");
  await expect(defaultHeader).toHaveCount(1);
  await expect(defaultHeader).toContainText(workspaceName);
  // It is the container itself: nothing to fold, rename or delete.
  await expect(defaultHeader.getByRole("button")).toHaveCount(0);

  // One team → one row of each work destination. A second team → two.
  for (const section of ["Mission Control", "Routines", "Files"]) {
    await expect(sectionRows(page, section)).toHaveCount(1);
  }
  await createTeam(page, "Work");
  for (const section of ["Mission Control", "Routines", "Files"]) {
    await expect(sectionRows(page, section)).toHaveCount(2);
  }
  // The named team keeps its own header affordances (the default one has none).
  await expect(page.locator("[data-sidebar-group-header]")).toHaveCount(1);
});

test("selecting a destination or an agent lights exactly one row", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("Your teams")).toBeVisible();

  const lit = rail(page).locator(
    "[data-sidebar-section-row][aria-current='page']",
  );
  await expect(lit).toHaveCount(0);

  await sectionRows(page, "Mission Control").first().click();
  await expect(lit).toHaveCount(1);
  await expect(lit).toContainText("Mission Control");

  await sectionRows(page, "Team Settings").first().click();
  await expect(lit).toHaveCount(1);
  await expect(lit).toContainText("Team Settings");

  // An agent row opens its team's MISSION CONTROL, pre-filtered to that agent.
  // Both rows light: the section says which surface is open, the agent row says
  // what it is filtered to. Team Settings lets go.
  await rail(page).getByText("Houston", { exact: true }).click();
  await expect(lit).toHaveCount(1);
  await expect(lit).toContainText("Mission Control");
  await expect(litAgentRow(page, "Houston")).toHaveCount(1);
});

test("Team Settings follows the caller's role", async ({ page, request }) => {
  // Single player: the solo user is the team's owner, so the row is there.
  await page.goto("/");
  await expect(sectionRows(page, "Team Settings")).toHaveCount(1);

  // A plain multiplayer member has no team administration — Mission Control
  // stays, Team Settings goes.
  await armCapabilities(request, MEMBER_CAPS);
  await page.reload();
  await expect(page.getByText("Your teams")).toBeVisible();
  await expect(sectionRows(page, "Mission Control")).toHaveCount(1);
  await expect(sectionRows(page, "Routines")).toHaveCount(1);
  await expect(sectionRows(page, "Files")).toHaveCount(1);
  await expect(sectionRows(page, "Team Settings")).toHaveCount(0);

  // An org owner is an implicit owner of every team — the row comes back.
  await armCapabilities(request, OWNER_CAPS);
  await page.reload();
  await expect(page.getByText("Your teams")).toBeVisible();
  await expect(sectionRows(page, "Team Settings")).toHaveCount(1);
});
