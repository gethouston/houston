import {
  FAKE_HOST_URL,
  SEED_AGENT_ID,
  SEED_AGENT_NAME,
} from "@houston/fake-host";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import {
  readSidebarLayout,
  type SeedSidebarLayout,
  seedSidebarLayout,
} from "./support/sidebar-layout";
import {
  openAgentSettingsSection,
  openTeamSection,
  rail,
  screen,
  type TeamSection,
  teamTab,
} from "./support/team-nav";

/**
 * A plain org MEMBER who nonetheless MANAGES an agent.
 *
 * Manage agents is the only door to the canonical agent settings page, so
 * gating it on the org role alone took every configure surface — job
 * description, Skills, People, the ceilings, Share — away from the very person
 * the gateway lets configure that agent. The section is therefore decided PER
 * TEAM (`visibleTeamSectionsForTeam`): the org owner/admin always, plus anyone
 * who manages at least one of THIS team's agents.
 *
 * This proves the whole rule from the rail down:
 *   - the team holding the agent they manage offers Manage agents;
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
 * only theirs to use. The seeded agent stays in the fleet as the workspace's own
 * team's one agent, so that block is a real team with a real member rather than
 * an empty placeholder — which is what makes its missing Manage agents row mean
 * something.
 */
const AGENTS = [
  { id: "agent-payroll", name: "Payroll Bot", access: "manager" },
  { id: "agent-helper", name: "Payroll Helper", access: "user" },
  { id: "agent-support", name: "Support Bot", access: "user" },
  { id: SEED_AGENT_ID, name: SEED_AGENT_NAME, access: "user" },
];

/** Two named teams; the seeded agent stays ungrouped, in the default team.
 *  Payroll carries a shared CONTEXT, the field the host mirrors into every
 *  member agent's `GROUP.md` on the layout write. */
const LAYOUT: SeedSidebarLayout = {
  groups: [
    {
      id: PAYROLL_TEAM,
      name: "Payroll",
      collapsed: false,
      agentIds: ["agent-payroll", "agent-helper"],
      context: "Payroll runs on the 25th.",
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

async function armMemberWorkspace(page: Page): Promise<void> {
  const request = page.request;
  await request.post(`${FAKE_HOST_URL}/__test__/capabilities`, {
    data: MEMBER_CAPS,
  });
  await request.post(`${FAKE_HOST_URL}/__test__/org`, {
    data: { agents: AGENTS },
  });
  // On the HOST, before any app script runs: the fake host serves the local
  // profile, so the layout (and the shared context riding in it) lives there.
  await seedSidebarLayout(request, LAYOUT);
}

/** The tab row of the team that is OPEN. The rail names teams; a team's own
 *  screen names its sections, so the per-team gate is read here. */
function sectionTabs(page: Page): Locator {
  return screen(page).locator("[data-team-section-tab]");
}

/** One lozenge of the open team, by section. */
function sectionTab(page: Page, section: TeamSection): Locator {
  return teamTab(page, section);
}

/** Open a team by clicking one of its agents in the rail, which pins that agent
 *  and opens ITS team's Tasks board. The one navigation into a team that is
 *  independent of what the rail draws above its agents. */
async function openTeamOfAgent(page: Page, agentName: string): Promise<void> {
  await rail(page).getByText(agentName, { exact: true }).click();
  const closePanel = page.getByRole("button", { name: "Close panel" });
  if (await closePanel.isVisible()) await closePanel.click();
}

/**
 * Boot, then clear the board's opening question.
 *
 * Home is the FIRST team's Tasks board now that there is no global board,
 * so this member lands on Payroll — a team with two agents and no missions yet.
 * An empty board asks which agent should run the first one, and with more than
 * one candidate that question is a MODAL whose overlay swallows every rail
 * click. None of these tests is about that flow, so answer it by dismissing it,
 * once, before the rail is touched.
 */
async function openShell(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByText("Your teams")).toBeVisible();
  const picker = page.getByRole("dialog", {
    name: "Which agent should run this?",
  });
  await picker.waitFor({ state: "visible" });
  await page.keyboard.press("Escape");
  await expect(picker).toBeHidden();
  const closePanel = page.getByRole("button", { name: "Close panel" });
  if (await closePanel.isVisible()) await closePanel.click();
}

/** Open one agent's Job description from the Payroll team's settings list. */
async function openJobDescription(page: Page, name: string): Promise<void> {
  await openTeamSection(page, "Manage agents");
  await screen(page)
    .getByRole("button", { name: `Open ${name}` })
    .click();
  await openAgentSettingsSection(page, "Job description");
}

test("a member who manages an agent gets Manage agents on THAT team only", async ({
  page,
}) => {
  await armMemberWorkspace(page);
  await openShell(page);

  // Home is Payroll, the team holding the agent they manage: it offers the
  // configure tab, so its row is four tabs wide.
  await expect(sectionTab(page, "Manage agents")).toBeVisible();
  await expect(sectionTabs(page)).toHaveCount(5);

  // And the tab goes somewhere: the row can never promise a section the screen
  // refuses to render (both read `visibleTeamSectionsForTeam` for this team).
  await openTeamSection(page, "Manage agents");
  await expect(sectionTab(page, "Manage agents")).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(
    screen(page).getByRole("heading", { level: 1, name: "Payroll" }),
  ).toBeVisible();

  // The team whose agents they only use offers its WORK and nothing else.
  await openTeamOfAgent(page, "Support Bot");
  await expect(
    screen(page).getByRole("heading", { name: "Support", level: 1 }),
  ).toBeVisible();
  await expect(sectionTab(page, "Tasks")).toBeVisible();
  await expect(sectionTab(page, "Routines")).toBeVisible();
  await expect(sectionTab(page, "Files")).toBeVisible();
  await expect(sectionTab(page, "Manage agents")).toHaveCount(0);
  await expect(sectionTabs(page)).toHaveCount(4);

  // Nor does the workspace's own team, whose one agent they also only use — the
  // gate is the caller's access on THIS team's agents, nothing about the team.
  await openTeamOfAgent(page, SEED_AGENT_NAME);
  await expect(sectionTab(page, "Manage agents")).toHaveCount(0);
  await expect(sectionTabs(page)).toHaveCount(4);
});

test("the team's shared context leads its settings and saves into the layout", async ({
  page,
}) => {
  // The LOCAL backend of the same card: a named team's context is the stored
  // sidebar group's own field, and saving it is the layout write the host turns
  // into each member agent's `GROUP.md`. The rail menu that used to open a
  // dialog onto this is gone, so this page is the one door.
  await armMemberWorkspace(page);
  await openShell(page);
  await openTeamSection(page, "Manage agents");

  await expect(
    screen(page).getByRole("heading", { name: "Team context" }),
  ).toBeVisible();
  await expect(
    screen(page).getByText("Every agent in this team knows this."),
  ).toBeVisible();

  const box = screen(page).getByTestId("team-context-input");
  await expect(box).toHaveValue("Payroll runs on the 25th.");

  await box.fill("Payroll runs on the 25th. Never guess an amount.");
  await box.blur();

  // The write lands on the group the card names, and touches no other group.
  // Read back from the HOST: that PUT is also what makes the host mirror the
  // new text into each member agent's `GROUP.md`, so the server's copy is the
  // only one that means anything.
  await expect
    .poll(async () => {
      const layout = await readSidebarLayout(page.request);
      return layout.groups.find((g) => g.id === PAYROLL_TEAM)?.context;
    })
    .toBe("Payroll runs on the 25th. Never guess an amount.");
  const stored = await readSidebarLayout(page.request);
  const support = stored.groups.find((g) => g.id === SUPPORT_TEAM);
  expect(support).toBeDefined();
  expect(support).not.toHaveProperty("context");
});

test("Manage agents lists EVERY agent of the team, not just the managed one", async ({
  page,
}) => {
  await armMemberWorkspace(page);
  await openShell(page);
  await openTeamSection(page, "Manage agents");

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
  await sectionTab(page, "Tasks").click();
  // An EMPTY board auto-opens its composer, and a two-agent team asks who
  // runs it first (use-mc-new-mission). That is the designed landing, not a
  // detour — acknowledge and dismiss it before navigating on.
  const picker = page.getByRole("dialog", {
    name: "Which agent should run this?",
  });
  await expect(picker).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(picker).toHaveCount(0);
  await openJobDescription(page, "Payroll Helper");
  await expect(page.getByText("No instructions yet")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Write instructions" }),
  ).toHaveCount(0);
});
