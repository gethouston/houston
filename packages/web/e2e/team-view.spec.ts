import { FAKE_HOST_URL, SEED_AGENT_ID } from "@houston/fake-host";
import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { createTeam } from "./support/sidebar-create";
import { type TeamSection, teamTab } from "./support/team-nav";

/**
 * The TEAM VIEW and its own chrome. Where `sidebar-teams.spec.ts` asserts what
 * the rail says, this asserts the screen: one frame around four sections, and
 * the team named exactly once on it.
 *
 *   - row 1 carries the team's name and the TAB ROW, which is the only section
 *     switch there is (the rail draws no section rows);
 *   - a team's Tasks tab opens a board SCOPED to its agents, whose own heading
 *     is the scope picker and says nothing about the team (an empty team shows
 *     its own empty state, not the other team's missions);
 *   - clicking an agent row filters that board to the agent, and the board's
 *     own filter menu shows it — the store holds an agent ID and the board
 *     works in folder paths, so this is the id -> path mapping under test;
 *   - the team-wide pin is the BOARD's alone: the rail sets it, the board
 *     shows it, the team's lozenge names it — and no other section reads it
 *     (Routines and Archived carry filters of their own);
 *   - Manage agents lists the team's agents and drills into the canonical agent
 *     settings page, and a plain member never gets the tab at all.
 */

const OWNER_CAPS = { multiplayer: true, teams: true, role: "owner" };
const MEMBER_CAPS = { multiplayer: true, teams: true, role: "user" };

async function armCapabilities(
  request: APIRequestContext,
  caps: Record<string, unknown>,
): Promise<void> {
  await request.post(`${FAKE_HOST_URL}/__test__/capabilities`, { data: caps });
}

/** A second agent with a mission of its own, so a filter has something to do. */
async function addKai(request: APIRequestContext): Promise<void> {
  const created = await request.post(`${FAKE_HOST_URL}/agents`, {
    data: { name: "Kai" },
  });
  const kai = (await created.json()) as { id: string };
  await request.post(`${FAKE_HOST_URL}/agents/${kai.id}/activities`, {
    data: { title: "Ship the payroll run", status: "needs_you" },
  });
}

/** An archived mission on the seeded agent, so a team's archive has a row. */
async function addArchivedMission(
  request: APIRequestContext,
  title: string,
): Promise<void> {
  await request.post(`${FAKE_HOST_URL}/agents/${SEED_AGENT_ID}/activities`, {
    data: { title, status: "archived" },
  });
}

function rail(page: Page): Locator {
  return page.locator("[data-tour-target='agents']");
}

/** The content column. Scopes lookups away from the rail, which carries
 *  same-named controls (the workspace switcher, an agent's own row). */
function screen(page: Page): Locator {
  // The screen ON THE GLASS: several kept-alive screens sit in the DOM at
  // once, so a page-level lookup would match the hidden ones too.
  return page.locator("[data-screen-active='true']");
}

/**
 * A tab in the team screen's own tab row (row 1). The rail draws no section
 * rows any more: the team frame names the team and carries the ONE section
 * switch, so "open Files" is a click on the screen, not in the rail.
 */
function sectionTab(page: Page, section: TeamSection): Locator {
  return teamTab(page, section);
}

/**
 * The screen's heading — which IS the team's own lozenge, the first in the
 * cluster. Its accessible name is whatever the lozenge says: the team alone,
 * or "<team> <agent>" while an agent is pinned.
 */
function teamTitle(page: Page, name: string): Locator {
  return screen(page).getByRole("heading", { level: 1, name, exact: true });
}

/** The team's lozenge: the board's door, and the pin's undo. */
function homeLozenge(page: Page): Locator {
  return teamTab(page, "Tasks");
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

/** The name the default team wears: the workspace's own, read off the switcher. */
async function workspaceName(page: Page): Promise<string> {
  return (
    await page.locator("[data-tour-target='spaceSwitcher']").innerText()
  ).trim();
}

async function openShell(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByText("Your teams")).toBeVisible();
}

test("a team's Tasks tab opens that team's board, named once and scoped", async ({
  page,
  request,
}) => {
  await addKai(request);
  await openShell(page);
  const workspace = await workspaceName(page);

  // The strip names the team ONCE, inside its own lozenge, and says nothing
  // else while no agent is pinned. There is no "Tasks" label anywhere: the
  // team's lozenge IS the board's door. No second heading either.
  await sectionTab(page, "Tasks").click();
  await expect(teamTitle(page, workspace)).toBeVisible();
  await expect(homeLozenge(page)).toHaveAttribute("aria-current", "page");
  await expect(screen(page).getByText("Tasks", { exact: true })).toHaveCount(0);
  await expect(screen(page).getByText("All agents")).toHaveCount(0);
  await expect(screen(page).getByRole("heading", { level: 2 })).toHaveCount(0);
  await expect(screen(page).getByText("Plan a trip to Tokyo")).toBeVisible();
  await expect(screen(page).getByText("Ship the payroll run")).toBeVisible();

  // A named team starts empty, and its board says so instead of showing the
  // workspace's missions — the scope is the team, not the sweep behind it.
  await createTeam(page, "Work");
  await sectionTab(page, "Tasks").click();
  await expect(teamTitle(page, "Work")).toBeVisible();
  await expect(
    screen(page).getByText("No agents in this team yet"),
  ).toBeVisible();
  await expect(screen(page).getByText("Plan a trip to Tokyo")).toHaveCount(0);
});

test("the lozenge cluster is the only section switch, and it lights the open one", async ({
  page,
  request,
}) => {
  await armCapabilities(request, OWNER_CAPS);
  await openShell(page);

  // The rail promises no sections any more: every one of them is a lozenge on
  // the screen, and the cluster IS `visibleTeamSectionsForTeam` for this team
  // — the team's own lozenge standing in for the board.
  await expect(rail(page).locator("[data-sidebar-section-row]")).toHaveCount(0);
  await expect(screen(page).locator("[data-team-section-tab]")).toHaveCount(5);

  // The lozenge that is open says so, and exactly one does.
  await sectionTab(page, "Routines").click();
  await expect(sectionTab(page, "Routines")).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(
    screen(page).locator("[data-team-section-tab][aria-current='page']"),
  ).toHaveCount(1);
});

test("an agent row filters the board, and the team's lozenge undoes it", async ({
  page,
  request,
}) => {
  await addKai(request);
  await openShell(page);

  // Clicking an agent opens ITS team's board pre-filtered to it. The store
  // pins the agent's ID; the board filters on its folder path.
  await rail(page).getByText("Kai", { exact: true }).click();
  await expect(screen(page).getByText("Ship the payroll run")).toBeVisible();
  await expect(screen(page).getByText("Plan a trip to Tokyo")).toHaveCount(0);
  // The team's lozenge grows a second segment naming the pinned agent, so the
  // heading itself becomes "<team> <agent>".
  const workspace = await workspaceName(page);
  await expect(homeLozenge(page)).toContainText("Kai");
  await expect(teamTitle(page, `${workspace} Kai`)).toBeVisible();
  await expect(litAgentRow(page, "Kai")).toHaveCount(1);
  await expect(litAgentRow(page, "Houston")).toHaveCount(0);

  // Arm 2 of the home lozenge's grammar: already on the board and narrowed, so
  // the click widens back to the whole team rather than navigating.
  await homeLozenge(page).click();
  await expect(screen(page).getByText("Ship the payroll run")).toBeVisible();
  await expect(screen(page).getByText("Plan a trip to Tokyo")).toBeVisible();
  await expect(litAgentRow(page, "Kai")).toHaveCount(0);
  await expect(homeLozenge(page)).not.toContainText("Kai");
  await expect(teamTitle(page, workspace)).toBeVisible();

  // Arm 3: on the whole team's own board, the same click does nothing at all.
  await homeLozenge(page).click();
  await expect(homeLozenge(page)).toHaveAttribute("aria-current", "page");
  await expect(teamTitle(page, workspace)).toBeVisible();
});

test("Manage agents lists the team's agents and drills into the agent settings page", async ({
  page,
  request,
}) => {
  await armCapabilities(request, OWNER_CAPS);
  await addKai(request);
  await openShell(page);
  const workspace = await workspaceName(page);

  await sectionTab(page, "Manage agents").click();
  // ONE title on the page: row 1's. The section's own page header collapsed
  // into it, so the team's name is never printed twice.
  await expect(teamTitle(page, workspace)).toBeVisible();
  await expect(screen(page).getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(
    screen(page).getByRole("button", { name: "Open Kai" }),
  ).toBeVisible();
  await expect(
    screen(page).getByRole("button", { name: "Open Houston" }),
  ).toBeVisible();

  // Drilling in lands on the ONE canonical agent settings page — this is its
  // only door, in every deployment — under a back bar naming the team.
  await screen(page).getByRole("button", { name: "Open Kai" }).click();
  await expect(
    page
      .getByRole("navigation", { name: "Agent settings sections" })
      .getByRole("button", { name: "People with access" }),
  ).toBeVisible();
  await screen(page)
    .locator("button:not([data-team-section-tab])")
    .filter({ hasText: workspace })
    .click();
  await expect(
    screen(page).getByRole("button", { name: "Open Kai" }),
  ).toBeVisible();
});

test("the archive is a TAB, and the tab is both doors", async ({ page }) => {
  await openShell(page);
  const workspace = await workspaceName(page);

  // The archive stopped being a mode the board swapped into. It is a section,
  // so the lit tab is the only thing that has to say where you are: no title,
  // no "· Archived" qualifier, no crumb segment. HOU-1043's rule is satisfied
  // better than by the old pill-in / back-button-out pair, because one
  // permanently visible LABELLED control is both doors.
  await sectionTab(page, "Tasks").click();
  await sectionTab(page, "Archived").click();
  await expect(sectionTab(page, "Archived")).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(teamTitle(page, workspace)).toBeVisible();
  await expect(screen(page).getByRole("heading", { level: 2 })).toHaveCount(0);
  await expect(
    screen(page).getByRole("button", { name: "Back to tasks" }),
  ).toHaveCount(0);

  // And back, by the same control.
  await sectionTab(page, "Tasks").click();
  await expect(sectionTab(page, "Tasks")).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("a team's archive lets go of the shared panel when the user leaves", async ({
  page,
  request,
}) => {
  await addArchivedMission(request, "Old expense report");
  await openShell(page);

  // The archive is not a `MissionBoard`, so it carries its own release of the
  // ONE shell detail panel (HOU-1165's family). Without it the archived chat
  // keeps portaling into that panel after the user has navigated away.
  await sectionTab(page, "Archived").click();
  await screen(page).getByText("Old expense report").first().click();
  await expect(page.getByTestId("mission-panel")).toBeVisible();

  await page.locator("[data-tour-target='nav-skills']").click();
  await expect(page.getByTestId("mission-panel")).toBeHidden();
});

test("a plain member gets Routines and Files, and only loses Manage agents", async ({
  page,
  request,
}) => {
  await armCapabilities(request, MEMBER_CAPS);
  await openShell(page);

  // Routines and Files show the team's WORK, so they are every member's; only
  // Manage agents CONFIGURES, so only Manage agents is gated. The tab row IS
  // the visible-sections list, so a missing tab is the whole gate.
  await expect(sectionTab(page, "Routines")).toBeVisible();
  await expect(sectionTab(page, "Files")).toBeVisible();
  await expect(sectionTab(page, "Manage agents")).toHaveCount(0);
  // Archived is the team's WORK in the past tense, so a member keeps it.
  await expect(sectionTab(page, "Archived")).toBeVisible();
  await expect(screen(page).locator("[data-team-section-tab]")).toHaveCount(4);

  // And the tabs go somewhere: the row can never promise a section the screen
  // will not render (`visibleTeamSectionsForTeam` is the one list both read).
  await sectionTab(page, "Routines").click();
  await expect(sectionTab(page, "Routines")).toHaveAttribute(
    "aria-current",
    "page",
  );
  await sectionTab(page, "Files").click();
  await expect(sectionTab(page, "Files")).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("a plain member lands on Tasks, with the team named once", async ({
  page,
  request,
}) => {
  await armCapabilities(request, MEMBER_CAPS);
  await openShell(page);

  await expect(sectionTab(page, "Manage agents")).toHaveCount(0);
  await sectionTab(page, "Tasks").click();
  await expect(sectionTab(page, "Tasks")).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(teamTitle(page, await workspaceName(page))).toBeVisible();
  // No agent pinned, so the crumb is the team and nothing else.
  await expect(screen(page).getByText("All agents")).toHaveCount(0);
});
