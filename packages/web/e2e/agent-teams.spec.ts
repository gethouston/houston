import {
  FAKE_HOST_URL,
  SEED_AGENT_ID,
  SEED_AGENT_NAME,
} from "@houston/fake-host";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import {
  createTeam,
  openCreateDialog,
  startNewTeam,
} from "./support/sidebar-create";
import {
  readSidebarLayout,
  type SeedSidebarLayout,
} from "./support/sidebar-layout";
import {
  expectTeamSections,
  openTeamSection,
  rail,
  screen,
} from "./support/team-nav";

/**
 * SERVER-BACKED agent teams (C13), driven against the real rail and the real
 * "Manage agents" screen.
 *
 * A team stops being one user's sidebar grouping the moment the gateway
 * advertises `agentTeams`: it is a named group of agents AND people inside a
 * shared space, so the client's stored layout degrades to an ordering overlay
 * and every structural question is the server's to answer. That is a different
 * product, and these specs guard the four places a user meets it:
 *
 *   - the rail draws every team the READ returns, and the read returns the ones
 *     you are part of — the filter is the gateway's, not the client's, so a
 *     team of the space that is neither yours nor holds an agent you can see
 *     costs no rail, and no sidebar affordance lets you add yourself to one
 *     (that is the team's own Members card);
 *   - creating a team broadcasts the name the user TYPED, never a placeholder;
 *   - moving an agent between teams is a write, so it can be refused, and a
 *     refusal must undo itself visibly and explain itself calmly;
 *   - "Manage agents" grows the two surfaces a shared team has and a private
 *     grouping does not: its people, and a per-team configure gate that no
 *     longer follows the caller's org role.
 *
 * Everything here hangs off `POST /__test__/capabilities {agentTeams:true}`.
 * With the capability off the client runs the pre-C13 local backend unchanged,
 * which is what every other sidebar spec in this suite already proves.
 */

/** An `agentTeams` gateway seen by an org OWNER: an implicit owner of every
 *  team, which is the lens most of the write surfaces need. */
const OWNER_CAPS = {
  multiplayer: true,
  teams: true,
  agentTeams: true,
  role: "owner",
};

/** The same gateway, on the space the caller has to themselves. A C8 Spaces
 *  host is what makes "personal vs team space" a question at all, so the flag
 *  is armed here and the workspace switcher's personal row stays selected. */
const PERSONAL_CAPS = { ...OWNER_CAPS, spaces: true };

/** The same gateway seen by a plain member: they own only the teams they hold
 *  an explicit owner row on, and manage only the agents assigned to them. */
const MEMBER_CAPS = {
  multiplayer: true,
  teams: true,
  agentTeams: true,
  role: "user",
};

/** The caller the fake host serves (`SELF_USER_ID`). */
const SELF = "u-self";

// Server team ids. They are the gateway's, so the rail wears them verbatim in
// `[data-sidebar-section-row="<teamId>:<section>"]` and
// `[data-sidebar-group-header="<teamId>"]`.
const ACME_TEAM = "team-acme";
const OPS_TEAM = "team-ops";
const DESIGN_TEAM = "team-design";

const OPS_AGENT = "agent-ops";
const BRAND_AGENT = "agent-brand";

/** The org roster behind the Members card's names (`memberLabel` = the email). */
const ADA = { userId: SELF, email: "ada@acme.test", role: "owner" as const };
const BOB = { userId: "u-bob", email: "bob@acme.test", role: "user" as const };

interface TeamSeed {
  id: string;
  name: string;
  isDefault?: boolean;
  sortOrder?: number;
  agentIds?: string[];
  members?: { userId: string; owner?: boolean }[];
  /** The team's shared context. Omitted arms a team nobody has written one for,
   *  which the wire still serves as `""` — the column's empty default. */
  context?: string;
}

interface AgentSeed {
  id: string;
  name: string;
  access?: "manager" | "user";
  /** Explicit assignees. An agent with none is the everyone sentinel and is
   *  visible to the whole space; naming somebody ELSE is the only way to make
   *  an agent invisible to the caller, which is what the C7 role matrix does to
   *  `GET /agents` and, through it, to a team's `agentSlugs`. */
  assignments?: { userId: string; access: "manager" | "user" }[];
}

/**
 * Arm the whole C13 world server-to-server, BEFORE the first `page.goto`: the
 * capability the client feature-detects on, the fleet `GET /agents` serves, and
 * the team world `GET /v1/org/teams` serves. Three separate controls because
 * they are three separate reads in the product, and a spec that armed only the
 * teams would be testing a rail whose agents do not exist.
 */
async function armServerTeams(
  page: Page,
  seed: {
    caps: Record<string, unknown>;
    agents: AgentSeed[];
    teams: TeamSeed[];
    members?: { userId: string; email: string; role: "owner" | "user" }[];
    /** Make the active space a PERSONAL one (C13 §Personal spaces): the same
     *  team surface, minus the three member-management routes. */
    personalSpace?: boolean;
  },
): Promise<void> {
  const request = page.request;
  await request.post(`${FAKE_HOST_URL}/__test__/capabilities`, {
    data: seed.caps,
  });
  await request.post(`${FAKE_HOST_URL}/__test__/org`, {
    data: {
      agents: seed.agents,
      ...(seed.members ? { members: seed.members } : {}),
    },
  });
  await request.post(`${FAKE_HOST_URL}/__test__/agent-teams`, {
    data: {
      teams: seed.teams,
      ...(seed.personalSpace ? { personalSpace: true } : {}),
    },
  });
}

/** The seeded agent stays in every fleet: it owns the seeded mission, and an
 *  empty board opens the "which agent?" picker over the rail on its own. */
const HOUSTON: AgentSeed = { id: SEED_AGENT_ID, name: SEED_AGENT_NAME };

async function openShell(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByText("Your teams")).toBeVisible();
  const closePanel = page.getByRole("button", { name: "Close panel" });
  if (await closePanel.isVisible()) await closePanel.click();
}

/** Open a team by clicking one of its agents in the rail, which pins that agent
 *  and opens ITS team's Tasks board. */
async function openTeamOfAgent(page: Page, agentName: string): Promise<void> {
  await rail(page).getByText(agentName, { exact: true }).click();
  const closePanel = page.getByRole("button", { name: "Close panel" });
  if (await closePanel.isVisible()) await closePanel.click();
}

/** Open a team's Manage agents: its block header in the rail (the rail names
 *  TEAMS), then the tab on the team's own screen (the screen names its
 *  SECTIONS). A team with no agents is reachable only this way. */
async function openManageAgents(page: Page, teamId: string): Promise<void> {
  const namedHeader = groupHeader(page, teamId);
  const header =
    (await namedHeader.count()) > 0 ? namedHeader : defaultHeader(page);
  await header.getByRole("button").first().click();
  await openTeamSection(page, "Manage agents");
}

/** One team's block header, by server team id. */
function groupHeader(page: Page, teamId: string): Locator {
  return rail(page).locator(`[data-sidebar-group-header="${teamId}"]`);
}

/** The trailing DEFAULT block's header. Server-backed it is a real team, so it
 *  wears the SERVER's name and carries the affordances C13 gives it. */
function defaultHeader(page: Page): Locator {
  return rail(page).locator("[data-sidebar-default-header]");
}

/** Open a block header's "..." menu. */
async function openBlockMenu(header: Locator): Promise<void> {
  await header.getByRole("button", { name: "Team options" }).click();
}

/** Rename a block through its header menu's ONE identity entry: the
 *  "Change icon & name" dialog every team (and the create flow) shares. */
async function renameBlock(
  page: Page,
  header: Locator,
  name: string,
): Promise<void> {
  await openBlockMenu(header);
  await page.getByRole("menuitem", { name: "Change icon & name" }).click();
  const dialog = page.getByRole("dialog", { name: "Change icon & name" });
  const input = dialog.getByRole("textbox", { name: "Team name" });
  await input.waitFor({ state: "visible" });
  await input.fill(name);
  await dialog.getByRole("button", { name: "Save" }).click();
}

/** The contents of one team's block; `""` is the trailing default block. */
function blockRows(page: Page, teamId: string): Locator {
  return rail(page).locator(`[data-sidebar-drop-section="${teamId}"]`);
}

/** Just the AGENT rows of one team's block. How many agents a block holds used
 *  to be readable off a count badge on its header; the header carries only its
 *  name now, so the honest question is how many rows are in it. */
function blockAgentRows(page: Page, teamId: string): Locator {
  return blockRows(page, teamId).locator("[data-sidebar-item]");
}

interface WireCall {
  method: string;
  path: string;
  /** RAW body, parsed at the assertion site: a non-JSON POST from any other
   *  surface must never throw inside the listener and fail an unrelated test. */
  body: string | null;
}

/** Every request the page makes to the gateway, in order. The honest way to
 *  assert what a gesture actually SENT, as opposed to what it rendered. */
function recordGatewayCalls(page: Page): WireCall[] {
  const calls: WireCall[] = [];
  page.on("request", (req) => {
    if (!req.url().startsWith(FAKE_HOST_URL)) return;
    calls.push({
      method: req.method(),
      path: new URL(req.url()).pathname,
      body: req.postData(),
    });
  });
  return calls;
}

function callsTo(calls: WireCall[], method: string, path: string): WireCall[] {
  return calls.filter((c) => c.method === method && c.path === path);
}

async function center(loc: Locator) {
  const box = await loc.boundingBox();
  if (!box) throw new Error("no bounding box");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Drag `source` onto `target`, re-reading the target's live position as the
 *  list reflows during the drag (a fixed pre-drag coordinate would miss) —
 *  the same gesture `sidebar-dnd.spec.ts` uses against this rail. */
async function dragOnto(page: Page, source: Locator, target: Locator) {
  const s = await center(source);
  await page.mouse.move(s.x, s.y);
  await page.mouse.down();
  await page.waitForTimeout(60);
  await page.mouse.move(s.x, s.y + 10, { steps: 5 }); // cross activation
  for (let i = 0; i < 3; i++) {
    const t = await center(target);
    await page.mouse.move(t.x, t.y, { steps: 8 });
    await page.waitForTimeout(60);
  }
  await page.mouse.up();
  await page.waitForTimeout(300); // drop-animation + overlay unmount
}

/**
 * Seen through a plain MEMBER's lens: one default team, one team they hold a
 * row on, and one team of the space that is neither theirs nor holds an agent
 * assigned to them. The client renders the complete team world the gateway
 * returns; it does not apply a second membership filter.
 *
 * The member lens is load-bearing here: an org owner/admin is an implicit owner
 * of every team, so the read serves them the whole list and there would be
 * nothing to observe.
 */
const MEMBERSHIP_WORLD = {
  caps: MEMBER_CAPS,
  agents: [
    HOUSTON,
    { id: OPS_AGENT, name: "Ops Bot" },
    {
      id: BRAND_AGENT,
      name: "Brand Bot",
      // Shared with the CALLER: that visible agent is exactly why the Design
      // team — which the caller is not a member of — appears in their rail
      // at all (C13 visibility: joined, or holding an agent you can see).
      assignments: [
        { userId: SELF, access: "user" as const },
        { userId: BOB.userId, access: "user" as const },
      ],
    },
  ],
  teams: [
    { id: ACME_TEAM, name: "Acme", isDefault: true, sortOrder: 0 },
    {
      id: OPS_TEAM,
      name: "Operations",
      sortOrder: 1,
      agentIds: [OPS_AGENT],
      members: [{ userId: SELF, owner: true }],
    },
    // A public team of the space the caller is not a member of.
    {
      id: DESIGN_TEAM,
      name: "Design",
      sortOrder: 2,
      agentIds: [BRAND_AGENT],
      members: [{ userId: SELF }, { userId: BOB.userId }],
    },
  ],
};

test("Your teams draws every team the gateway serves, and it serves the ones you are part of", async ({
  page,
}) => {
  await armServerTeams(page, MEMBERSHIP_WORLD);
  await openShell(page);

  // The default block wears the SERVER's name for it, not the workspace's:
  // on this backend the space names its own catch-all team.
  await expect(page.locator("[data-sidebar-default-header]")).toContainText(
    "Acme",
  );
  await expect(groupHeader(page, OPS_TEAM)).toBeVisible();

  // Visibility is the gateway's answer: the client draws every team and agent
  // it is handed, including a team the caller does not personally belong to.
  // The rail is an ACCORDION — a team that is not the active one starts
  // folded — so the block opens before its rows are read.
  await expect(groupHeader(page, DESIGN_TEAM)).toBeVisible();
  await groupHeader(page, DESIGN_TEAM).getByRole("button").first().click();
  await expect(blockRows(page, DESIGN_TEAM)).toContainText("Brand Bot");

  // And nothing in the rail offers a way IN. A plain member may not create
  // agents, so the band's one control degrades to the single thing they can
  // add; joining is not on it, because people are added on a team's own
  // Members card and never claimed from the sidebar.
  await expect(
    rail(page).getByRole("button", { name: "New team", exact: true }),
  ).toBeVisible();
  await expect(rail(page).getByRole("button", { name: /join/i })).toHaveCount(
    0,
  );
});

test("creating a team sends the typed name, and it lands in Your teams", async ({
  page,
}) => {
  await armServerTeams(page, {
    caps: OWNER_CAPS,
    agents: [HOUSTON],
    teams: [{ id: ACME_TEAM, name: "Acme", isDefault: true, sortOrder: 0 }],
  });
  const calls = recordGatewayCalls(page);
  await openShell(page);

  const created = () => callsTo(calls, "POST", "/v1/org/teams");
  const headers = rail(page).locator("[data-sidebar-group-header]");

  // Closing the modal creates nothing.
  await startNewTeam(page);
  const draft = page.getByRole("textbox", { name: "Team name" });
  await draft.waitFor({ state: "visible" });
  await page.keyboard.press("Escape");
  await expect(headers).toHaveCount(0);
  expect(created()).toHaveLength(0);

  await startNewTeam(page);
  const input = page.getByRole("textbox", { name: "Team name" });
  await input.waitFor({ state: "visible" });
  await input.pressSequentially("Field Ops");
  await page.getByRole("button", { name: "Create team" }).click();

  // Exactly ONE create, carrying the typed name...
  await expect.poll(() => created().length).toBe(1);
  const body = created()[0].body;
  expect(body).not.toBeNull();
  expect(JSON.parse(body as string)).toEqual({ name: "Field Ops" });
  // ...and no team was ever broadcast to the space under the rail's placeholder
  // label, which everyone else in a shared space would have seen appear.
  expect(created().map((c) => JSON.parse(c.body as string).name)).not.toContain(
    "New team",
  );

  // It lands as a real team block: the draft is gone, replaced by the server's.
  await expect(headers).toHaveCount(1);
  await expect(headers).toContainText("Field Ops");
});

test("Move to team re-homes the agent on the server, and a refusal puts it back", async ({
  page,
}) => {
  await armServerTeams(page, {
    caps: OWNER_CAPS,
    agents: [HOUSTON, { id: OPS_AGENT, name: "Ops Bot" }],
    teams: [
      { id: ACME_TEAM, name: "Acme", isDefault: true, sortOrder: 0 },
      {
        id: OPS_TEAM,
        name: "Operations",
        sortOrder: 1,
        members: [{ userId: SELF, owner: true }],
      },
    ],
  });
  const calls = recordGatewayCalls(page);
  await openShell(page);
  await expect(blockAgentRows(page, OPS_TEAM)).toHaveCount(0);

  // The EXPLICIT action that replaced cross-team drag: an agent's row in its
  // team's Manage agents list carries the full agent menu, and "Move to team"
  // opens a submenu of the OTHER teams plus a confirmation that says the
  // consequence before anything is sent.
  await openTeamSection(page, "Manage agents");
  await screen(page)
    .getByRole("button", { name: `More actions for ${SEED_AGENT_NAME}` })
    .click();
  await page.getByRole("menuitem", { name: "Move to team" }).hover();
  await page.getByRole("menuitem", { name: "Operations" }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText(
    `${SEED_AGENT_NAME} moves to Operations. People who can see that team will see this agent in it.`,
  );
  await confirm.getByRole("button", { name: "Move agent" }).click();

  // It is a WRITE on this backend: the client asks the server to re-home the
  // agent, it does not merely re-draw its own layout.
  const moves = () => callsTo(calls, "PUT", `/v1/agents/${SEED_AGENT_ID}/team`);
  await expect.poll(() => moves().length).toBe(1);
  expect(JSON.parse(moves()[0].body as string)).toEqual({ teamId: OPS_TEAM });
  await expect(blockAgentRows(page, OPS_TEAM)).toHaveCount(1);
  await expect(blockRows(page, OPS_TEAM)).toContainText(SEED_AGENT_NAME);

  // Now the half that matters: the gateway is the real enforcer, and it can
  // refuse a move the client already applied. Only the PUT is intercepted —
  // fulfilling the CORS preflight too would fail the call as a network error
  // and never deliver the `{error, code}` body the taxonomy reads.
  await page.route("**/v1/agents/*/team", async (route) => {
    if (route.request().method() !== "PUT") return route.fallback();
    await route.fulfill({
      status: 403,
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
      },
      body: JSON.stringify({
        error: "not a team owner",
        code: "not_team_owner",
      }),
    });
  });

  await screen(page)
    .getByRole("button", { name: "More actions for Ops Bot" })
    .click();
  await page.getByRole("menuitem", { name: "Move to team" }).hover();
  await page.getByRole("menuitem", { name: "Operations" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Move agent" })
    .click();

  // The optimistic move is UNDONE, visibly: the agent is back in the block it
  // came from and the team it was moved to is the size it was.
  await expect(blockRows(page, "")).toContainText("Ops Bot");
  await expect(blockAgentRows(page, OPS_TEAM)).toHaveCount(1);
  await expect(blockRows(page, OPS_TEAM)).not.toContainText("Ops Bot");

  // And it says why, informationally. Nothing is broken: this is a permission
  // the user does not have, so the red report-a-bug pair must not fire. The
  // toast's ROLE carries that: `status` is the calm channel, `alert` the
  // "something went wrong" one, so asking for the message inside a `status` is
  // the same assertion the eye makes about the border, in the vocabulary a
  // screen-reader user gets too.
  const message = page
    .getByRole("status")
    .filter({ hasText: "Only this team's owners can change it" });
  await expect(message).toBeVisible();
  await expect(page.getByText("Houston, we have a problem!")).toHaveCount(0);
});

test("Move to team never offers the team the agent is already in", async ({
  page,
}) => {
  // A picker that listed the current team would make a no-op look like a move.
  await armServerTeams(page, {
    caps: OWNER_CAPS,
    agents: [HOUSTON],
    teams: [
      { id: ACME_TEAM, name: "Acme", isDefault: true, sortOrder: 0 },
      {
        id: OPS_TEAM,
        name: "Operations",
        sortOrder: 1,
        members: [{ userId: SELF, owner: true }],
      },
    ],
  });
  await openShell(page);
  await openTeamSection(page, "Manage agents");
  await screen(page)
    .getByRole("button", { name: `More actions for ${SEED_AGENT_NAME}` })
    .click();
  await page.getByRole("menuitem", { name: "Move to team" }).hover();
  await expect(
    page.getByRole("menuitem", { name: "Operations" }),
  ).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Acme" })).toHaveCount(0);
});

test("an agent's row carries the whole agent menu, not just the move", async ({
  page,
}) => {
  // The rail's agent rows dropped their "..." menu — a navigation row is no
  // place for a destructive act — so the roster took it over whole.
  await armServerTeams(page, {
    caps: OWNER_CAPS,
    agents: [HOUSTON],
    teams: [{ id: ACME_TEAM, name: "Acme", isDefault: true, sortOrder: 0 }],
  });
  await openShell(page);
  await openTeamSection(page, "Manage agents");
  await screen(page)
    .getByRole("button", { name: `More actions for ${SEED_AGENT_NAME}` })
    .click();

  await expect(
    page.getByRole("menuitem", { name: "Rename agent" }),
  ).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: "Change color" }),
  ).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: "Delete agent" }),
  ).toBeVisible();
  // One team in the workspace, so there is nowhere to move to and the entry
  // is absent rather than opening on "no other teams".
  await expect(
    page.getByRole("menuitem", { name: "Move to team" }),
  ).toHaveCount(0);
});

test("Manage agents names the team's members, and its owner toggle writes", async ({
  page,
}) => {
  await armServerTeams(page, {
    caps: OWNER_CAPS,
    members: [ADA, BOB],
    agents: [HOUSTON, { id: OPS_AGENT, name: "Ops Bot" }],
    teams: [
      { id: ACME_TEAM, name: "Acme", isDefault: true, sortOrder: 0 },
      {
        id: OPS_TEAM,
        name: "Operations",
        sortOrder: 1,
        agentIds: [OPS_AGENT],
        members: [{ userId: SELF, owner: true }, { userId: BOB.userId }],
      },
    ],
  });
  const calls = recordGatewayCalls(page);
  await openShell(page);

  await openManageAgents(page, OPS_TEAM);
  await expect(
    screen(page).getByRole("heading", { level: 1, name: "Operations" }),
  ).toBeVisible();

  // The card names PEOPLE, resolved through the org roster, not raw ids. The
  // heading carries the team's size, hence the prefix match.
  await expect(
    screen(page).getByRole("heading", { name: /^Members/ }),
  ).toBeVisible();
  await expect(screen(page).getByText(ADA.email)).toBeVisible();
  await expect(screen(page).getByText(BOB.email)).toBeVisible();
  // Explicit rows only, so it says so: the space's owners and admins run every
  // team without ever appearing in one.
  await expect(
    screen(page).getByText(
      "Owners and managers of this space can manage every team",
      { exact: false },
    ),
  ).toBeVisible();

  const bobControl = screen(page).getByRole("button", {
    name: `Change role for ${BOB.email}`,
  });
  await expect(bobControl).toContainText("Member");

  await bobControl.click();
  await page.getByRole("menuitem", { name: "Owner" }).click();

  // The toggle is a write, and the row then reads back what the server holds.
  const writes = () =>
    callsTo(calls, "PUT", `/v1/org/teams/${OPS_TEAM}/members/${BOB.userId}`);
  await expect.poll(() => writes().length).toBe(1);
  expect(JSON.parse(writes()[0].body as string)).toEqual({ owner: true });
  await expect(
    screen(page).getByRole("button", {
      name: `Change role for ${BOB.email}`,
    }),
  ).toContainText("Owner");
});

test("the default team's member list is read-only and says why", async ({
  page,
}) => {
  await armServerTeams(page, {
    caps: OWNER_CAPS,
    members: [ADA, BOB],
    agents: [HOUSTON],
    teams: [
      { id: ACME_TEAM, name: "Acme", isDefault: true, sortOrder: 0 },
      {
        id: OPS_TEAM,
        name: "Operations",
        sortOrder: 1,
        members: [{ userId: SELF, owner: true }],
      },
    ],
  });
  const calls = recordGatewayCalls(page);
  await openShell(page);

  await openManageAgents(page, ACME_TEAM);
  await expect(
    screen(page).getByRole("heading", { level: 1, name: "Acme" }),
  ).toBeVisible();
  await expect(
    screen(page).getByRole("heading", { name: /^Members/ }),
  ).toBeVisible();

  // It explains itself INSTEAD of listing anyone. Everyone in the space is
  // already in it, so there are no rows to keep and every member write on it is
  // refused on the wire.
  await expect(
    screen(page).getByText(
      "Everyone in this space is already in this team, so there is no separate list to manage.",
    ),
  ).toBeVisible();
  await expect(
    screen(page).getByText("The people who joined this team."),
  ).toHaveCount(0);
  await expect(
    screen(page).getByRole("button", { name: /^Change role for/ }),
  ).toHaveCount(0);
  await expect(
    screen(page).getByRole("button", { name: "Leave team" }),
  ).toHaveCount(0);

  // Read-only all the way down to the wire: the membership read is never even
  // fired, because the default team holds no explicit rows to read.
  expect(
    calls.filter((c) => c.path.endsWith(`/v1/org/teams/${ACME_TEAM}/members`)),
  ).toHaveLength(0);
});

test("a team's shared context is the first card of its settings, and it saves", async ({
  page,
}) => {
  // The ONE door onto what a team's agents are told. It used to be a rail menu
  // entry opening a dialog, which only ever worked on the local backend; here
  // the field is the gateway's own and the card writes it with a PATCH.
  await armServerTeams(page, {
    caps: OWNER_CAPS,
    agents: [HOUSTON, { id: OPS_AGENT, name: "Ops Bot" }],
    teams: [
      { id: ACME_TEAM, name: "Acme", isDefault: true, sortOrder: 0 },
      {
        id: OPS_TEAM,
        name: "Operations",
        sortOrder: 1,
        agentIds: [OPS_AGENT],
        context: "We ship on Fridays.",
        members: [{ userId: SELF, owner: true }],
      },
    ],
  });
  const calls = recordGatewayCalls(page);
  await openShell(page);

  await openManageAgents(page, OPS_TEAM);
  await expect(
    screen(page).getByRole("heading", { level: 1, name: "Operations" }),
  ).toBeVisible();

  // It LEADS the page: above the roster, because it is the only thing here that
  // changes how the team's agents behave.
  const card = screen(page).getByRole("heading", { name: "Team context" });
  await expect(card).toBeVisible();
  await expect(
    screen(page).getByText("Every agent in this team knows this."),
  ).toBeVisible();

  const box = screen(page).getByTestId("team-context-input");
  await expect(box).toHaveText("We ship on Fridays.");

  // Saves on BLUR, the same idiom the agent's own instructions editor uses.
  await box.click();
  await page.keyboard.press("ControlOrMeta+A");
  await box.pressSequentially(
    "We ship on Fridays. Ask before promising a date.",
  );
  await box.blur();
  const patches = () => callsTo(calls, "PATCH", `/v1/org/teams/${OPS_TEAM}`);
  await expect.poll(() => patches().length).toBe(1);
  expect(JSON.parse(patches()[0].body ?? "{}")).toEqual({
    context: "We ship on Fridays. Ask before promising a date.",
  });
});

test("a team's context is READ-ONLY for someone who does not own the team", async ({
  page,
}) => {
  // Knowing what your team's agents are told is not a privilege, so the card
  // stays and stays legible; only the write is withheld, and the gateway would
  // refuse it anyway (`403 not_team_owner`).
  await armServerTeams(page, {
    caps: MEMBER_CAPS,
    members: [{ ...ADA, role: "user" }, BOB],
    agents: [{ ...HOUSTON, access: "manager" }],
    teams: [
      { id: ACME_TEAM, name: "Acme", isDefault: true, sortOrder: 0 },
      {
        id: OPS_TEAM,
        name: "Operations",
        sortOrder: 1,
        agentIds: [SEED_AGENT_ID],
        context: "We ship on Fridays.",
        members: [{ userId: SELF }, { userId: BOB.userId, owner: true }],
      },
    ],
  });
  const calls = recordGatewayCalls(page);
  await openShell(page);

  await openManageAgents(page, OPS_TEAM);
  const box = screen(page).getByTestId("team-context-input");
  await expect(box).toHaveText("We ship on Fridays.");
  await expect(box).toHaveAttribute("contenteditable", "false");
  await expect(box).toHaveAttribute("aria-readonly", "true");

  // Read-only all the way down to the wire: a blur writes nothing.
  await box.click();
  await box.blur();
  expect(callsTo(calls, "PATCH", `/v1/org/teams/${OPS_TEAM}`)).toHaveLength(0);
});

test("the default team renames from the rail, and that is the ONLY thing its menu offers", async ({
  page,
}) => {
  // Server-backed the trailing block is not a virtual container any more: it is
  // a real team whose name is the SPACE's, so an owner has to be able to change
  // it where they read it. Everything else stays off — the wire answers
  // `400 default_team` to a delete, and everyone is in it so there is nothing
  // to leave. The team's shared context is not here either: it lives on the
  // team's Manage agents page now, on every backend.
  await armServerTeams(page, {
    caps: OWNER_CAPS,
    agents: [HOUSTON],
    teams: [{ id: ACME_TEAM, name: "Acme", isDefault: true, sortOrder: 0 }],
  });
  const calls = recordGatewayCalls(page);
  await openShell(page);

  const header = defaultHeader(page);
  await expect(header).toContainText("Acme");
  await openBlockMenu(header);
  await expect(
    page.getByRole("menuitem", { name: "Change icon & name" }),
  ).toBeVisible();
  for (const gone of ["Delete team", "Leave team"])
    await expect(page.getByRole("menuitem", { name: gone })).toHaveCount(0);
  await page.keyboard.press("Escape");

  // The rename is a WRITE against the default team's own id, not a local edit
  // of a label: the block used to have no door onto it at all.
  await renameBlock(page, header, "Acme Studio");
  const patches = () => callsTo(calls, "PATCH", `/v1/org/teams/${ACME_TEAM}`);
  await expect.poll(() => patches().length).toBe(1);
  expect(JSON.parse(patches()[0].body ?? "{}")).toEqual({
    name: "Acme Studio",
  });
  await expect(header).toContainText("Acme Studio");
});

test("a caller who does not own the default team gets no menu on it", async ({
  page,
}) => {
  // Renaming is a team-owner power (C13), and the default block reads the same
  // gate every other block reads. A plain member sees the block, its name and
  // its work, and no "..." at all — not a menu whose one entry would 403.
  await armServerTeams(page, {
    caps: MEMBER_CAPS,
    members: [{ ...ADA, role: "user" }],
    agents: [{ ...HOUSTON, access: "user" }],
    teams: [{ id: ACME_TEAM, name: "Acme", isDefault: true, sortOrder: 0 }],
  });
  await openShell(page);

  await expect(defaultHeader(page)).toContainText("Acme");
  await expect(
    defaultHeader(page).getByRole("button", { name: "Team options" }),
  ).toHaveCount(0);
});

test("a personal space groups its agents into teams, and offers nothing about people", async ({
  page,
}) => {
  // The line C13 draws is PEOPLE, not teams. A space with one human in it uses
  // teams exactly like a shared one; what it must not do is put a roster, a
  // Leave button or a Join entry in front of somebody who is alone in there —
  // the three member-management routes are the only thing the gateway still
  // refuses (`403 personal_space`), so those would be the only 403 a solo user
  // could reach in this whole surface.
  await armServerTeams(page, {
    caps: PERSONAL_CAPS,
    personalSpace: true,
    agents: [HOUSTON, { id: OPS_AGENT, name: "Ops Bot" }],
    teams: [
      { id: ACME_TEAM, name: "Acme", isDefault: true, sortOrder: 0 },
      // The one human in the space created this team, so they hold its owner
      // row and always will — nothing can remove it. That is the ONLY state the
      // gateway can serve here, and the fake host forces it too, so a spec
      // cannot pass against a personal-space team nobody has joined.
      {
        id: OPS_TEAM,
        name: "Operations",
        sortOrder: 1,
        agentIds: [OPS_AGENT],
        members: [{ userId: SELF, owner: true }],
      },
    ],
  });
  const calls = recordGatewayCalls(page);
  await openShell(page);

  await expect(groupHeader(page, OPS_TEAM)).toBeVisible();
  await expect(blockRows(page, OPS_TEAM)).toContainText("Ops Bot");

  // The team's own menu keeps what acts on the TEAM and drops the one entry
  // that acts on a membership. Leaving is impossible here — the creator's owner
  // row cannot be removed and `POST …/leave` answers `403 personal_space` — so
  // offering it would be a dead end dressed as a choice.
  await openBlockMenu(groupHeader(page, OPS_TEAM));
  await expect(
    page.getByRole("menuitem", { name: "Change icon & name" }),
  ).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: "Delete team" }),
  ).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Leave team" })).toHaveCount(
    0,
  );
  await page.keyboard.press("Escape");

  // The default team is renamable here too: a personal space's default team is
  // still a real team, and its one human owns it.
  await openBlockMenu(defaultHeader(page));
  await expect(
    page.getByRole("menuitem", { name: "Change icon & name" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  // Creating one works exactly as it does in a shared space: the gateway takes
  // it, and it lands in the rail.
  await createTeam(page, "Field Ops");
  await expect
    .poll(() => callsTo(calls, "POST", "/v1/org/teams").length)
    .toBe(1);

  // The create dialog offers what a solo user can act on, and only that.
  await openCreateDialog(page);
  const chooser = page.getByRole("dialog", { name: "Create", exact: true });
  await expect(
    chooser.getByRole("button", { name: "New agent", exact: true }),
  ).toBeVisible();
  await expect(
    chooser.getByRole("button", { name: "New team", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  // "Manage agents" keeps the two surfaces a team HAS for one person — its name
  // and its agents — and drops the Members card whole.
  await openManageAgents(page, OPS_TEAM);
  await expect(
    screen(page).getByRole("heading", { level: 1, name: "Operations" }),
  ).toBeVisible();
  await expect(screen(page).getByLabel("Team name")).toBeVisible();
  await expect(screen(page).getByText("Ops Bot")).toBeVisible();
  await expect(
    screen(page).getByRole("heading", { name: /^Members/ }),
  ).toHaveCount(0);
  await expect(
    screen(page).getByRole("button", { name: "Leave team" }),
  ).toHaveCount(0);
  // The card never mounts, so its read is never fired either.
  expect(calls.filter((c) => c.path.endsWith("/members"))).toHaveLength(0);
});

test("a joined member who manages nothing gets no Manage agents row; managing one agent gives it back", async ({
  page,
}) => {
  const fleet = (access: "manager" | "user"): AgentSeed[] => [
    { ...HOUSTON, access: "user" },
    { id: OPS_AGENT, name: "Ops Bot", access },
  ];
  const teams: TeamSeed[] = [
    { id: ACME_TEAM, name: "Acme", isDefault: true, sortOrder: 0 },
    {
      id: OPS_TEAM,
      name: "Operations",
      sortOrder: 1,
      agentIds: [OPS_AGENT],
      // Joined, but a plain member of it: the team is theirs to WORK in, not
      // to configure.
      members: [{ userId: SELF, owner: false }],
    },
  ];
  await armServerTeams(page, {
    caps: MEMBER_CAPS,
    members: [{ ...ADA, role: "user" }],
    agents: fleet("user"),
    teams,
  });
  await openShell(page);

  // The team is in "Your teams"...
  await expect(groupHeader(page, OPS_TEAM)).toBeVisible();
  // ...and its screen offers its WORK, whole, and nothing that configures it.
  // On this backend the gate is the SERVER's answer for THIS team, not the
  // caller's org role: a member who owns no team and manages no agent has
  // nothing to administer anywhere.
  await openTeamOfAgent(page, "Ops Bot");
  await expectTeamSections(page, ["Tasks", "Routines", "Files", "Archived"]);

  // Give them ONE agent of that team to manage and the door comes back — on
  // that team alone, because the agent-manager clause is per team.
  await page.request.post(`${FAKE_HOST_URL}/__test__/org`, {
    data: { agents: fleet("manager") },
  });
  await page.reload();
  await expect(page.getByText("Your teams")).toBeVisible();

  // The default team, whose one agent they only USE, still offers three.
  await openTeamOfAgent(page, SEED_AGENT_NAME);
  await expectTeamSections(page, ["Tasks", "Routines", "Files", "Archived"]);

  // And the tab goes somewhere: the row can never promise a section the screen
  // refuses to render (both read `visibleTeamSectionsForTeam` for this team).
  await openTeamOfAgent(page, "Ops Bot");
  await expectTeamSections(page, [
    "Tasks",
    "Routines",
    "Files",
    "Archived",
    "Manage agents",
  ]);
  await openTeamSection(page, "Manage agents");
  await expect(
    screen(page).getByRole("heading", { level: 1, name: "Operations" }),
  ).toBeVisible();
});

/** The per-workspace ordering overlay as it is actually STORED on this surface:
 *  the fake host advertises the local profile, so the adapter writes it through
 *  `PUT /v1/workspaces/:id/sidebar-layout` and "was the overlay written?" is a
 *  question for the host. */
function storedOverlay(page: Page): Promise<SeedSidebarLayout> {
  return readSidebarLayout(page.request);
}

test("dragging a team block reorders it on the SERVER, and the block stays put", async ({
  page,
}) => {
  // Team order is the server's on this backend (the overlay never reorders
  // teams), so the header drag has to be a `sortOrder` write. Writing the
  // stored layout instead would leave the rail exactly as it was and still
  // persist something, which is a control that pretends to work.
  await armServerTeams(page, {
    caps: OWNER_CAPS,
    agents: [HOUSTON],
    teams: [
      { id: ACME_TEAM, name: "Acme", isDefault: true, sortOrder: 0 },
      {
        id: OPS_TEAM,
        name: "Operations",
        sortOrder: 1,
        members: [{ userId: SELF, owner: true }],
      },
      {
        id: DESIGN_TEAM,
        name: "Design",
        sortOrder: 2,
        members: [{ userId: SELF, owner: true }],
      },
    ],
  });
  const calls = recordGatewayCalls(page);
  await openShell(page);

  const headers = rail(page).locator("[data-sidebar-group-header]");
  await expect(headers).toContainText(["Operations", "Design"]);

  await dragOnto(
    page,
    groupHeader(page, DESIGN_TEAM),
    groupHeader(page, OPS_TEAM),
  );

  const patches = () => callsTo(calls, "PATCH", `/v1/org/teams/${DESIGN_TEAM}`);
  await expect.poll(() => patches().length).toBe(1);
  expect(JSON.parse(patches()[0].body as string)).toEqual({ sortOrder: 0.5 });
  // The block does not snap back while the round trip runs.
  await expect(headers).toContainText(["Design", "Operations"]);
  // And nothing was written to the stored layout: the overlay has no say in
  // team order, so writing it would be a lie about what just happened. An
  // untouched layout reads back as the host's default — empty on both halves.
  expect(await storedOverlay(page)).toMatchObject({
    groups: [],
    ungroupedOrder: [],
  });

  // The round trip: a reload re-reads `GET /v1/org/teams`, which now sorts
  // Design first because the gateway was actually told.
  await page.reload();
  await expect(page.getByText("Your teams")).toBeVisible();
  await expect(headers).toContainText(["Design", "Operations"]);
});
