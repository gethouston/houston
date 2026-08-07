import { FAKE_HOST_URL, SEED_AGENT_ID } from "@houston/fake-host";
import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";

/**
 * The TEAM VIEW, driven end to end from the rail that navigates to it. Where
 * `sidebar-teams.spec.ts` asserts what the rail says, this asserts that the
 * screen behind each row is the one the rail promised:
 *
 *   - a team's Mission Control row opens a board TITLED with the team and
 *     SCOPED to its agents (an empty team shows its own empty state, not the
 *     other team's missions);
 *   - clicking an agent row filters that board to the agent, and the board's
 *     own filter menu shows it — the store holds an agent ID and the board
 *     works in folder paths, so this is the id -> path mapping under test;
 *   - changing the filter INSIDE the board moves the rail's selected row back,
 *     because both sides read the one `teamAgentFilter`;
 *   - Team Settings lists the team's agents and drills into the canonical agent
 *     settings page, and a plain member never gets the row at all.
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
  return page.locator("[data-tour-target='main']");
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

/** The name the default team wears: the workspace's own, read off the switcher. */
async function workspaceName(page: Page): Promise<string> {
  return (
    await page.locator("[data-tour-target='spaceSwitcher']").innerText()
  ).trim();
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

async function openShell(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByText("Your teams")).toBeVisible();
}

test("a team's Mission Control row opens that team's board, titled and scoped", async ({
  page,
  request,
}) => {
  await addKai(request);
  await openShell(page);
  const workspace = await workspaceName(page);

  // The default team IS the workspace, so its board carries the workspace's
  // name (not the global board's "Mission Control") and holds every agent's
  // missions, because every agent is in it.
  await sectionRows(page, "Mission Control").first().click();
  await expect(
    screen(page).getByRole("heading", { level: 1, name: workspace }),
  ).toBeVisible();
  await expect(page.getByText("Plan a trip to Tokyo")).toBeVisible();
  await expect(page.getByText("Ship the payroll run")).toBeVisible();

  // A named team starts empty, and its board says so instead of showing the
  // workspace's missions — the scope is the team, not the sweep behind it.
  await createTeam(page, "Work");
  await sectionRows(page, "Mission Control").first().click();
  await expect(page.getByText("No agents in this team yet")).toBeVisible();
  await expect(page.getByText("Plan a trip to Tokyo")).toHaveCount(0);
});

test("an agent row filters its team's board, and the board's own menu moves it back", async ({
  page,
  request,
}) => {
  await addKai(request);
  await openShell(page);

  // Clicking an agent opens ITS team's board pre-filtered to it. The store
  // pins the agent's ID; the board filters on its folder path.
  await rail(page).getByText("Kai", { exact: true }).click();
  await expect(page.getByText("Ship the payroll run")).toBeVisible();
  await expect(page.getByText("Plan a trip to Tokyo")).toHaveCount(0);
  // The board's own filter menu shows the same choice the rail made.
  const filter = screen(page).getByRole("button", { name: "Kai", exact: true });
  await expect(filter).toBeVisible();
  await expect(litAgentRow(page, "Kai")).toHaveCount(1);
  await expect(litAgentRow(page, "Houston")).toHaveCount(0);

  // Change it from INSIDE the board: the rail's selected row follows, because
  // the rail and the board read the same pin.
  await filter.click();
  await page.getByRole("menuitem", { name: "Houston" }).click();
  await expect(page.getByText("Plan a trip to Tokyo")).toBeVisible();
  await expect(page.getByText("Ship the payroll run")).toHaveCount(0);
  await expect(litAgentRow(page, "Houston")).toHaveCount(1);
  await expect(litAgentRow(page, "Kai")).toHaveCount(0);

  // Clearing it releases the rail's fill too.
  await screen(page)
    .getByRole("button", { name: "Houston", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "All agents" }).click();
  await expect(page.getByText("Ship the payroll run")).toBeVisible();
  await expect(litAgentRow(page, "Houston")).toHaveCount(0);
});

test("Team Settings lists the team's agents and drills into the agent settings page", async ({
  page,
  request,
}) => {
  await armCapabilities(request, OWNER_CAPS);
  await addKai(request);
  await openShell(page);
  const workspace = await workspaceName(page);

  await sectionRows(page, "Team Settings").first().click();
  await expect(
    screen(page).getByRole("heading", { level: 1, name: workspace }),
  ).toBeVisible();
  await expect(
    screen(page).getByRole("button", { name: "Open Kai" }),
  ).toBeVisible();
  await expect(
    screen(page).getByRole("button", { name: "Open Houston" }),
  ).toBeVisible();

  // Drilling in lands on the ONE canonical agent settings page — the same rail
  // Settings > Permissions opens — under a back bar naming the team.
  await screen(page).getByRole("button", { name: "Open Kai" }).click();
  await expect(
    page
      .getByRole("navigation", { name: "Agent settings sections" })
      .getByRole("button", { name: "People with access" }),
  ).toBeVisible();
  await screen(page)
    .getByRole("button", { name: workspace, exact: true })
    .click();
  await expect(
    screen(page).getByRole("button", { name: "Open Kai" }),
  ).toBeVisible();
});

test("a team's archive is titled with the team; the global one stays bare", async ({
  page,
}) => {
  await openShell(page);
  const workspace = await workspaceName(page);

  // The heading composes the BOARD's name with the MODE on purpose: titled
  // with the bare team name, a team's archive would read exactly like that
  // team's active board.
  await sectionRows(page, "Mission Control").first().click();
  await screen(page).getByRole("button", { name: "Archived" }).click();
  await expect(
    screen(page).getByRole("heading", {
      level: 1,
      name: `${workspace} · Archived`,
      exact: true,
    }),
  ).toBeVisible();

  // The GLOBAL archive has no board name to compose with, so it stays the
  // mode alone.
  await screen(page).getByRole("button", { name: "Back to missions" }).click();
  await page.locator("[data-tour-target='nav-dashboard']").click();
  await screen(page).getByRole("button", { name: "Archived" }).click();
  await expect(
    screen(page).getByRole("heading", {
      level: 1,
      name: "Archived",
      exact: true,
    }),
  ).toBeVisible();
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
  await sectionRows(page, "Mission Control").first().click();
  await screen(page).getByRole("button", { name: "Archived" }).click();
  await screen(page).getByText("Old expense report").first().click();
  await expect(page.getByTestId("mission-panel")).toBeVisible();

  await page.locator("[data-tour-target='nav-skills']").click();
  await expect(page.getByTestId("mission-panel")).toBeHidden();
});

test("a plain member gets no Team Settings row, and lands on Mission Control", async ({
  page,
  request,
}) => {
  await armCapabilities(request, MEMBER_CAPS);
  await openShell(page);

  await expect(sectionRows(page, "Team Settings")).toHaveCount(0);
  const missionControl = sectionRows(page, "Mission Control").first();
  await missionControl.click();
  await expect(missionControl).toHaveAttribute("aria-current", "page");
  await expect(
    screen(page).getByRole("heading", {
      level: 1,
      name: await workspaceName(page),
    }),
  ).toBeVisible();
});
