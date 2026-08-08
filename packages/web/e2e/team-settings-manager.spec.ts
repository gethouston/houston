import {
  FAKE_HOST_URL,
  SEED_AGENT_ID,
  SEED_AGENT_NAME,
  SEED_WORKSPACE_ID,
} from "@houston/fake-host";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import {
  openAgentSettingsSection,
  openTeamSection,
  rail,
  screen,
} from "./support/team-nav";

/**
 * A plain org MEMBER who nonetheless MANAGES an agent.
 *
 * Team Settings is the only door to the canonical agent settings page, so
 * gating it on the org role alone took every configure surface — job
 * description, Skills, People, the ceilings, Share — away from the very person
 * the gateway lets configure that agent. The section is therefore decided PER
 * TEAM (`visibleTeamSectionsForTeam`): the org owner/admin always, plus anyone
 * who manages at least one of THIS team's agents.
 *
 * This proves the whole rule from the rail down:
 *   - the team holding the agent they manage offers Team Settings;
 *   - the team whose agents they only USE does not, and neither does the
 *     workspace's own — the rail and the screen read one list per team, so a
 *     row is never a dead link;
 *   - drilling in, they get the EDITABLE face on the agent they manage and the
 *     read-only face on the other agent of the same team.
 *
 * The Teams-shaped state single-player can't reach is armed via the fake host's
 * `/__test__/capabilities` and `/__test__/org`. The two teams are stored sidebar
 * GROUPS, seeded straight into the key the web adapter keeps them under
 * (`engine-adapter/client/workspaces-mixin.ts` — sidebar layout is deliberately
 * localStorage, not host-backed), because a plain member has no "New team"
 * affordance and so cannot build this state through the UI.
 */

/** Teams plain member: multiplayer + Teams, org role `user`. */
const MEMBER_CAPS = { multiplayer: true, teams: true, role: "user" };

const PAYROLL_TEAM = "grp-payroll";
const SUPPORT_TEAM = "grp-support";

/**
 * The fleet. `access` is the SERVED caller's own effective level, which is what
 * `isAgentManager` reads: Payroll Bot is theirs to manage, every other agent is
 * only theirs to use. The seeded agent stays in the fleet so its seeded mission
 * keeps the cross-agent board non-empty — an empty board legitimately opens the
 * "which agent?" picker on its own, which would sit over the rail.
 */
const AGENTS = [
  { id: "agent-payroll", name: "Payroll Bot", access: "manager" },
  { id: "agent-helper", name: "Payroll Helper", access: "user" },
  { id: "agent-support", name: "Support Bot", access: "user" },
  { id: SEED_AGENT_ID, name: SEED_AGENT_NAME, access: "user" },
];

/** Two named teams; the seeded agent stays ungrouped, in the default team. */
const LAYOUT = {
  groups: [
    {
      id: PAYROLL_TEAM,
      name: "Payroll",
      collapsed: false,
      agentIds: ["agent-payroll", "agent-helper"],
    },
    {
      id: SUPPORT_TEAM,
      name: "Support",
      collapsed: false,
      agentIds: ["agent-support"],
    },
  ],
  ungroupedOrder: [SEED_AGENT_ID],
};

/** The adapter's per-workspace sidebar-layout key (`SIDEBAR_LAYOUT_PREF`). */
const LAYOUT_KEY = `houston.sidebar-layout.${SEED_WORKSPACE_ID}`;

async function armMemberWorkspace(page: Page): Promise<void> {
  const request = page.request;
  await request.post(`${FAKE_HOST_URL}/__test__/capabilities`, {
    data: MEMBER_CAPS,
  });
  await request.post(`${FAKE_HOST_URL}/__test__/org`, {
    data: { agents: AGENTS },
  });
  // Before any app script runs, exactly like the boot seed does.
  await page.addInitScript(
    ([key, layout]) => localStorage.setItem(key, layout),
    [LAYOUT_KEY, JSON.stringify(LAYOUT)] as const,
  );
}

/** One team's destination row, by the id the rail gives it (`<team>:<section>`). */
function sectionRow(page: Page, teamId: string, section: string): Locator {
  return rail(page).locator(
    `[data-sidebar-section-row="${teamId}:${section}"]`,
  );
}

async function openShell(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByText("Your teams")).toBeVisible();
}

/** Open one agent's Job description from the Payroll team's settings list. */
async function openJobDescription(page: Page, name: string): Promise<void> {
  await openTeamSection(page, "Team Settings");
  await screen(page)
    .getByRole("button", { name: `Open ${name}` })
    .click();
  await openAgentSettingsSection(page, "Job description");
}

test("a member who manages an agent gets Team Settings on THAT team only", async ({
  page,
}) => {
  await armMemberWorkspace(page);
  await openShell(page);

  // The team holding the agent they manage offers the configure door...
  await expect(sectionRow(page, PAYROLL_TEAM, "settings")).toBeVisible();
  // ...and the team whose agents they only use offers its WORK and nothing else.
  await expect(sectionRow(page, SUPPORT_TEAM, "mission-control")).toBeVisible();
  await expect(sectionRow(page, SUPPORT_TEAM, "routines")).toBeVisible();
  await expect(sectionRow(page, SUPPORT_TEAM, "files")).toBeVisible();
  await expect(sectionRow(page, SUPPORT_TEAM, "settings")).toHaveCount(0);
  // Nor does the workspace's own team, whose one agent they also only use — the
  // gate is the caller's access on THIS team's agents, nothing about the team.
  await expect(sectionRow(page, "team:default", "settings")).toHaveCount(0);

  // Exactly one Team Settings row in the whole rail: the gate is per team, not
  // a global on/off that would light every block at once.
  await expect(
    rail(page)
      .locator("[data-sidebar-section-row]")
      .filter({ hasText: "Team Settings" }),
  ).toHaveCount(1);

  // And the row goes somewhere: the rail can never promise a section the screen
  // refuses to render (both read `visibleTeamSectionsForTeam` for this team).
  await openTeamSection(page, "Team Settings");
  await expect(sectionRow(page, PAYROLL_TEAM, "settings")).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(
    screen(page).getByRole("heading", { level: 1, name: "Payroll" }),
  ).toBeVisible();
});

test("Team Settings lists EVERY agent of the team, not just the managed one", async ({
  page,
}) => {
  await armMemberWorkspace(page);
  await openShell(page);
  await openTeamSection(page, "Team Settings");

  // The list is the team, whole. Hiding the agents they merely use would make
  // the team read as smaller than it is.
  await expect(
    screen(page).getByRole("button", { name: "Open Payroll Bot" }),
  ).toBeVisible();
  await expect(
    screen(page).getByRole("button", { name: "Open Payroll Helper" }),
  ).toBeVisible();
  // The other team's agent is not in it.
  await expect(
    screen(page).getByRole("button", { name: "Open Support Bot" }),
  ).toHaveCount(0);
});

test("the member EDITS the agent they manage and reads the other one read-only", async ({
  page,
}) => {
  await armMemberWorkspace(page);
  await openShell(page);

  // Their own agent: the editable face — the job description offers its write
  // affordance, which `AgentDetail` hides for a non-manager.
  await openJobDescription(page, "Payroll Bot");
  await expect(page.getByText("No instructions yet")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Write instructions" }),
  ).toBeVisible();

  // Back to the team, then into an agent of the SAME team they only use: the
  // page is reachable (it is honest — they can see what the agent is told) and
  // renders read-only. The gateway is the real enforcer either way.
  await screen(page)
    .getByRole("button", { name: "Payroll", exact: true })
    .click();
  await openJobDescription(page, "Payroll Helper");
  await expect(page.getByText("No instructions yet")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Write instructions" }),
  ).toHaveCount(0);
});
