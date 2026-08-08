import {
  FAKE_HOST_URL,
  SEED_AGENT_ID,
  SEED_AGENT_NAME,
  SEED_WORKSPACE_ID,
} from "@houston/fake-host";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { rail, screen } from "./support/team-nav";

/**
 * SERVER-BACKED agent teams (C13), driven against the real rail and the real
 * Team Settings screen.
 *
 * A team stops being one user's sidebar grouping the moment the gateway
 * advertises `agentTeams`: it is a named group of agents AND people inside a
 * shared space, so the client's stored layout degrades to an ordering overlay
 * and every structural question is the server's to answer. That is a different
 * product, and these specs guard the four places a user meets it:
 *
 *   - the rail splits into "Your teams" and the ones you have not joined;
 *   - creating a team broadcasts the name the user TYPED, never a placeholder;
 *   - a drag is a write, so it can be refused, and a refusal must undo itself
 *     visibly and explain itself calmly;
 *   - Team Settings grows the two surfaces a shared team has and a private
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
}

interface AgentSeed {
  id: string;
  name: string;
  access?: "manager" | "user";
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
    data: { teams: seed.teams },
  });
}

/** The seeded agent stays in every fleet: it owns the seeded mission, and an
 *  empty board opens the "which agent?" picker over the rail on its own. */
const HOUSTON: AgentSeed = { id: SEED_AGENT_ID, name: SEED_AGENT_NAME };

async function openShell(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByText("Your teams")).toBeVisible();
}

/** One team's destination row, by the id the rail gives it (`<team>:<section>`). */
function sectionRow(page: Page, teamId: string, section: string): Locator {
  return rail(page).locator(
    `[data-sidebar-section-row="${teamId}:${section}"]`,
  );
}

/** One team's block header, by server team id. */
function groupHeader(page: Page, teamId: string): Locator {
  return rail(page).locator(`[data-sidebar-group-header="${teamId}"]`);
}

/** The agent rows of one team's block; `""` is the trailing default block. */
function blockRows(page: Page, teamId: string): Locator {
  return rail(page).locator(`[data-sidebar-drop-section="${teamId}"]`);
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

test("Your teams shows the joined ones; the rest sit under Other teams, one click from joining", async ({
  page,
}) => {
  await armServerTeams(page, {
    caps: OWNER_CAPS,
    agents: [
      HOUSTON,
      { id: OPS_AGENT, name: "Ops Bot" },
      { id: BRAND_AGENT, name: "Brand Bot" },
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
      // Nobody the caller is: a public team of the space they never joined.
      {
        id: DESIGN_TEAM,
        name: "Design",
        sortOrder: 2,
        agentIds: [BRAND_AGENT],
        members: [{ userId: BOB.userId }],
      },
    ],
  });
  await openShell(page);

  // The default block wears the SERVER's name for it, not the workspace's:
  // on this backend the space names its own catch-all team.
  await expect(page.locator("[data-sidebar-default-header]")).toContainText(
    "Acme",
  );
  await expect(groupHeader(page, OPS_TEAM)).toBeVisible();

  // The unjoined team is not in the rail at all, and neither is its agent —
  // narrowing the rail's input is what keeps the default block from quietly
  // adopting an "Other teams" agent as one of its own leftovers.
  await expect(groupHeader(page, DESIGN_TEAM)).toHaveCount(0);
  await expect(rail(page).getByText("Brand Bot")).toHaveCount(0);

  // It sits in the FOOTER instead, closed: these are by definition the teams
  // the user did not choose, so the rows stay out of the way until asked for.
  const other = page.getByRole("region", { name: "Other teams" });
  await expect(other).toBeVisible();
  await expect(
    other.getByRole("button", { name: "Join team Design" }),
  ).toHaveCount(0);

  await other.getByRole("button", { name: /^Other teams/ }).click();
  // Each row states what it is and how big it is before offering the action.
  await expect(other.getByText("Design", { exact: true })).toBeVisible();
  await expect(other.getByText("1 member")).toBeVisible();

  await other.getByRole("button", { name: "Join team Design" }).click();

  // Joining is sidebar PINNING: the team moves up into "Your teams" with its
  // agents, and the disclosure empties out because nothing is left unjoined.
  await expect(groupHeader(page, DESIGN_TEAM)).toBeVisible();
  await expect(rail(page).getByText("Brand Bot")).toBeVisible();
  await expect(page.getByRole("region", { name: "Other teams" })).toHaveCount(
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

  // An abandoned name creates NOTHING. The draft row is local to this user
  // until a name exists, which is the whole reason it is a draft.
  await page.getByRole("button", { name: "New team" }).click();
  const draft = page.getByPlaceholder("Team name");
  await draft.waitFor({ state: "visible" });
  await draft.press("Escape");
  await expect(headers).toHaveCount(0);
  expect(created()).toHaveLength(0);

  await page.getByRole("button", { name: "New team" }).click();
  const input = page.getByPlaceholder("Team name");
  await input.waitFor({ state: "visible" });
  // Typed character by character: a re-focus-and-select on every render used to
  // eat all but the last keystroke, and the name is exactly what is broadcast.
  await input.pressSequentially("Field Ops");
  await input.press("Enter");

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

test("dragging an agent to another team moves it on the server, and a refusal puts it back", async ({
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

  const ops = groupHeader(page, OPS_TEAM);
  await expect(ops).toContainText("0");

  // A drop is a WRITE on this backend: the rail asks the server to re-home the
  // agent, it does not merely re-draw its own layout.
  await dragOnto(
    page,
    rail(page).getByText(SEED_AGENT_NAME, { exact: true }),
    ops,
  );

  const moves = () => callsTo(calls, "PUT", `/v1/agents/${SEED_AGENT_ID}/team`);
  await expect.poll(() => moves().length).toBe(1);
  expect(JSON.parse(moves()[0].body as string)).toEqual({ teamId: OPS_TEAM });
  await expect(ops).toContainText("1");
  await expect(blockRows(page, OPS_TEAM)).toContainText(SEED_AGENT_NAME);

  // Now the half that matters: the gateway is the real enforcer, and it can
  // refuse a move the rail already animated. Only the PUT is intercepted —
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

  await dragOnto(page, rail(page).getByText("Ops Bot", { exact: true }), ops);

  // The optimistic move is UNDONE, visibly: the agent is back in the block it
  // came from and the team it was dropped on is the size it was.
  await expect(blockRows(page, "")).toContainText("Ops Bot");
  await expect(ops).toContainText("1");
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

test("Team Settings names the team's members, and its owner toggle writes", async ({
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

  await sectionRow(page, OPS_TEAM, "settings").click();
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

  await sectionRow(page, ACME_TEAM, "settings").click();
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

test("a joined member who manages nothing gets no Team Settings row; managing one agent gives it back", async ({
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

  // The team is in "Your teams" and offers its WORK, whole...
  await expect(groupHeader(page, OPS_TEAM)).toBeVisible();
  await expect(sectionRow(page, OPS_TEAM, "mission-control")).toBeVisible();
  await expect(sectionRow(page, OPS_TEAM, "routines")).toBeVisible();
  await expect(sectionRow(page, OPS_TEAM, "files")).toBeVisible();
  // ...and nothing that configures it. On this backend the gate is the SERVER's
  // answer for THIS team, not the caller's org role: a member who owns no team
  // and manages no agent has nothing to administer anywhere.
  await expect(
    rail(page)
      .locator("[data-sidebar-section-row]")
      .filter({ hasText: "Team Settings" }),
  ).toHaveCount(0);

  // Give them ONE agent of that team to manage and the door comes back — on
  // that team alone, because the agent-manager clause is per team.
  await page.request.post(`${FAKE_HOST_URL}/__test__/org`, {
    data: { agents: fleet("manager") },
  });
  await page.reload();
  await expect(page.getByText("Your teams")).toBeVisible();

  await expect(sectionRow(page, OPS_TEAM, "settings")).toBeVisible();
  await expect(sectionRow(page, ACME_TEAM, "settings")).toHaveCount(0);
  await expect(
    rail(page)
      .locator("[data-sidebar-section-row]")
      .filter({ hasText: "Team Settings" }),
  ).toHaveCount(1);

  // The row goes somewhere: the rail can never promise a section the screen
  // refuses to render (both read `visibleTeamSectionsForTeam` for this team).
  await sectionRow(page, OPS_TEAM, "settings").click();
  await expect(
    screen(page).getByRole("heading", { level: 1, name: "Operations" }),
  ).toBeVisible();
});

/** The vertical position of an agent row, the same way `sidebar-dnd.spec.ts`
 *  reads order: where a row SITS is the only order the user can see. */
async function rowY(page: Page, name: string): Promise<number> {
  const box = await rail(page).getByText(name, { exact: true }).boundingBox();
  return box?.y ?? 0;
}

/** Assert `above` sits higher in the rail than `below`, polled: a drop, a
 *  rollback and a reload all settle asynchronously, and where a row SITS is the
 *  only order the user can see. */
async function expectAbove(page: Page, above: string, below: string) {
  await expect
    .poll(async () => (await rowY(page, above)) < (await rowY(page, below)))
    .toBe(true);
}

/** The per-workspace sidebar layout as it is actually STORED on this surface:
 *  the web adapter keeps it in `localStorage`, not on the wire, so "was the
 *  overlay written?" is a storage question, never a request one. */
function storedOverlay(page: Page): Promise<string | null> {
  return page.evaluate(
    (key) => localStorage.getItem(key),
    `houston.sidebar-layout.${SEED_WORKSPACE_ID}`,
  );
}

test("a cross-team drop lands WHERE it was dropped, not at the bottom of the block", async ({
  page,
}) => {
  // The drop position is the overlay's to remember, and the overlay decays
  // against the server's roster on every write. Pruned against the roster as it
  // still stands, the destination team does not hold the dropped agent yet, so
  // the write deletes the id it just recorded and the agent silently reappears
  // last. Two agents in the target block is the smallest arrangement where
  // "where it landed" and "at the end" are different answers.
  await armServerTeams(page, {
    caps: OWNER_CAPS,
    agents: [
      HOUSTON,
      { id: OPS_AGENT, name: "Ops Bot" },
      { id: BRAND_AGENT, name: "Brand Bot" },
    ],
    teams: [
      { id: ACME_TEAM, name: "Acme", isDefault: true, sortOrder: 0 },
      {
        id: OPS_TEAM,
        name: "Operations",
        sortOrder: 1,
        agentIds: [BRAND_AGENT],
        members: [{ userId: SELF, owner: true }],
      },
    ],
  });
  await openShell(page);

  await dragOnto(
    page,
    rail(page).getByText("Ops Bot", { exact: true }),
    blockRows(page, OPS_TEAM).getByText("Brand Bot", { exact: true }),
  );

  await expect(blockRows(page, OPS_TEAM)).toContainText("Ops Bot");
  await expectAbove(page, "Ops Bot", "Brand Bot");

  // And it is the SERVER that was told, so a reload reads it back: the position
  // survives in the overlay, the membership in the team.
  await page.reload();
  await expect(page.getByText("Your teams")).toBeVisible();
  await expect(blockRows(page, OPS_TEAM)).toContainText("Ops Bot");
  await expectAbove(page, "Ops Bot", "Brand Bot");
});

test("a refused cross-team drag puts the SOURCE block's order back exactly", async ({
  page,
}) => {
  // A drop is two optimistic writes, the team cache and the ordering overlay,
  // and a refusal has to undo BOTH. Undoing only the cache leaves the agent in
  // the block it came from but stripped from that block's stored order, so it
  // falls to the bottom as an unordered leftover: the drag was refused and the
  // rail rearranged itself anyway.
  await armServerTeams(page, {
    caps: OWNER_CAPS,
    agents: [
      HOUSTON,
      { id: OPS_AGENT, name: "Ops Bot" },
      { id: BRAND_AGENT, name: "Brand Bot" },
    ],
    teams: [
      { id: ACME_TEAM, name: "Acme", isDefault: true, sortOrder: 0 },
      {
        id: OPS_TEAM,
        name: "Operations",
        sortOrder: 1,
        agentIds: [OPS_AGENT, BRAND_AGENT],
        members: [{ userId: SELF, owner: true }],
      },
    ],
  });
  // The order the user already dragged into place, seeded as the OVERLAY the
  // gateway knows nothing about: Brand Bot above Ops Bot, the opposite of the
  // roster order the block would fall back to without it.
  await page.addInitScript(
    ([key, layout]) => localStorage.setItem(key, layout),
    [
      `houston.sidebar-layout.${SEED_WORKSPACE_ID}`,
      JSON.stringify({
        groups: [
          {
            id: OPS_TEAM,
            name: "",
            collapsed: false,
            agentIds: [BRAND_AGENT, OPS_AGENT],
          },
        ],
        ungroupedOrder: [],
      }),
    ] as const,
  );
  await openShell(page);
  await expectAbove(page, "Brand Bot", "Ops Bot");

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

  // Drag Brand Bot OUT of Operations, into the default block. Refused.
  await dragOnto(
    page,
    rail(page).getByText("Brand Bot", { exact: true }),
    rail(page).getByText(SEED_AGENT_NAME, { exact: true }),
  );

  // Back in Operations, and STILL above Ops Bot: the order the user set
  // survived a gesture the gateway refused.
  await expect(groupHeader(page, OPS_TEAM)).toContainText("2");
  await expect(blockRows(page, OPS_TEAM)).toContainText("Brand Bot");
  await expectAbove(page, "Brand Bot", "Ops Bot");
});

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
  // team order, so writing it would be a lie about what just happened.
  expect(await storedOverlay(page)).toBeNull();

  // The round trip: a reload re-reads `GET /v1/org/teams`, which now sorts
  // Design first because the gateway was actually told.
  await page.reload();
  await expect(page.getByText("Your teams")).toBeVisible();
  await expect(headers).toContainText(["Design", "Operations"]);
});
