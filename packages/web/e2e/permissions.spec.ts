import { FAKE_HOST_URL } from "@houston/fake-host";
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { openSettingsSection } from "./support/settings-nav";
import { openAgentSettings, rail } from "./support/team-nav";

/**
 * Permissions is FULLY AGENT-CENTRIC: the top level is the agent list, and
 * opening an agent lands on the ONE canonical agent settings page: a rail with
 * a Context group (Job description, Memory) and a Permissions group (People
 * with access, Apps, AI models, Skills), and the selected section beside it.
 * There is no top-level People tab and no per-person lens.
 *
 * This proves the whole shape: the list renders, drilling in shows the rail,
 * the team-wide access choice writes the everyone sentinel, a People access
 * change (Can use -> No access) set-replaces the roster via
 * `PUT /v1/agents/:slug/assignments`, and an Apps ceiling narrow persists via
 * `PUT /v1/agents/:slug/settings` — each verified with a full reload so the
 * write reached the gateway, not just the client cache.
 *
 * The Teams-shaped state single-player can't reach is armed via the fake host's
 * `/__test__/capabilities` (multiplayer + Teams + a `role`) and `/__test__/org`
 * (a multi-member roster + an agent fleet with per-agent assignments). See
 * `@houston/fake-host` README + `knowledge-base/ui-testing.md`.
 */

/** Teams owner: multiplayer + Teams, top role. */
const OWNER_CAPS = { multiplayer: true, teams: true, role: "owner" };

/** Teams plain member: multiplayer + Teams, can only USE assigned agents. */
const MEMBER_CAPS = { multiplayer: true, teams: true, role: "user" };

const ROSTER = [
  { userId: "u-self", email: "you@acme.test", role: "owner" },
  { userId: "u-bob", email: "bob@acme.test", role: "user" },
];

/** One agent the owner manages, with Bob on its explicit roster at "Can use". */
const AGENTS = [
  {
    id: "agent-finance",
    name: "Finance Bot",
    assignments: [
      { userId: "u-self", access: "manager" },
      { userId: "u-bob", access: "user" },
    ],
  },
];

async function armCapabilities(
  request: APIRequestContext,
  caps: Record<string, unknown>,
): Promise<void> {
  await request.post(`${FAKE_HOST_URL}/__test__/capabilities`, { data: caps });
}

async function armOrg(request: APIRequestContext): Promise<void> {
  await request.post(`${FAKE_HOST_URL}/__test__/org`, {
    data: { members: ROSTER, agents: AGENTS },
  });
}

/** Open Settings > Permissions (the agent list is the top level). */
async function openPermissions(page: Page): Promise<void> {
  await page.goto("/");
  await openSettingsSection(page, "permissions");
}

/** Open Permissions and drill into Finance Bot's settings page. */
async function openFinance(page: Page): Promise<void> {
  await openPermissions(page);
  await page.getByRole("button", { name: "Open Finance Bot" }).click();
}

/**
 * One item of the agent settings rail. Scoped to the rail's own landmark: the
 * app sidebar carries same-named entries (Skills, AI Models), so an unscoped
 * lookup would be ambiguous. Substring matching on purpose — a rail item's
 * accessible name also carries its count badge ("People with access 2").
 */
function railItem(page: Page, name: string) {
  return page
    .getByRole("navigation", { name: "Agent settings sections" })
    .getByRole("button", { name });
}

/**
 * Open the armed agent's canonical settings page through the OTHER door: its
 * team's Settings section. Same page, same rail, same authority rules as the
 * Permissions drill-in above — that is the point of the assertions below.
 * `armOrg` replaces the roster, so the team holds Finance Bot, not the seed.
 */
async function openAgentSettingsPage(page: Page): Promise<void> {
  await page.goto("/");
  await openAgentSettings(page, "Finance Bot");
}

test("the agent list is the top level, and opening an agent shows the settings rail", async ({
  page,
  request,
}) => {
  await armCapabilities(request, OWNER_CAPS);
  await armOrg(request);
  await openPermissions(page);

  // No top-level People tab — the top level is just the agent list.
  await expect(page.getByRole("tab", { name: "Agents" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Open Finance Bot" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Open Finance Bot" }).click();

  // The rail replaced the three-tab panel: two groups, six sections.
  await expect(page.getByRole("tab", { name: "People" })).toHaveCount(0);
  for (const section of [
    "Job description",
    "Memory",
    "People with access",
    "Apps",
    "AI models",
    "Skills",
  ]) {
    await expect(railItem(page, section)).toBeVisible();
  }
  // People opens by default (the drill-in's initial section).
  await expect(
    page.getByRole("heading", { name: "Who can use this agent?" }),
  ).toBeVisible();
});

test("People section: every member has a row, and a Can use -> No access change round-trips", async ({
  page,
  request,
}) => {
  await armCapabilities(request, OWNER_CAPS);
  await armOrg(request);
  await openFinance(page);

  // People is the default section. The owner is static; Bob has an editable
  // control showing his current level (Can use).
  await expect(page.getByText("you@acme.test")).toBeVisible();
  const bob = page.getByRole("button", {
    name: "Change access for bob@acme.test",
  });
  await expect(bob).toContainText("Can use");

  // Owner changes Bob to No access -> PUT set-replaces the roster.
  await bob.click();
  await page.getByRole("menuitem", { name: /No access/ }).click();
  await expect(bob).toContainText("No access");

  // GET round-trip: a full reload re-reads /agents from the host, and Bob's
  // access is still No access — the write reached the gateway, not just the cache.
  await openFinance(page);
  await expect(
    page.getByRole("button", { name: "Change access for bob@acme.test" }),
  ).toContainText("No access");
});

test("People section: the team-wide access choice writes the everyone sentinel", async ({
  page,
  request,
}) => {
  await armCapabilities(request, OWNER_CAPS);
  await armOrg(request);
  await openFinance(page);

  // Finance Bot has an explicit roster, so it opens on "Only specific people",
  // where every teammate carries a live per-person control.
  await expect(
    page.getByRole("radio", { name: "Only specific people" }),
  ).toBeChecked();
  await expect(
    page.getByRole("button", { name: "Change access for bob@acme.test" }),
  ).toBeVisible();

  // Its roster already resolves to the whole team at the same levels, so the
  // switch changes nobody's access and needs no confirm.
  await page.getByRole("radio", { name: "Everyone on your team" }).click();
  await expect(
    page.getByRole("radio", { name: "Everyone on your team" }),
  ).toBeChecked();

  // "Everyone" mode drops the per-person controls (the AllowlistEditor idiom):
  // using one would silently materialize the roster, the mirror of the
  // confirm-gated switch. The roster stays visible, just static.
  await expect(
    page.getByRole("button", { name: "Change access for bob@acme.test" }),
  ).toHaveCount(0);
  await expect(
    page.getByText("there is nothing to set person by person"),
  ).toBeVisible();

  // GET round-trip: a full reload re-reads /agents; the empty assignee set
  // reached the gateway and still reads as the everyone sentinel.
  await openFinance(page);
  await expect(
    page.getByRole("radio", { name: "Everyone on your team" }),
  ).toBeChecked();

  // Going back is confirm-gated: the write FREEZES today's roster, so it says
  // how many people it keeps before it replaces the sentinel.
  await page.getByRole("radio", { name: "Only specific people" }).click();
  await expect(
    page.getByRole("heading", { name: "Switch to specific people?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Yes, pick people" }).click();
  await expect(
    page.getByRole("radio", { name: "Only specific people" }),
  ).toBeChecked();
  await openFinance(page);
  await expect(
    page.getByRole("button", { name: "Change access for bob@acme.test" }),
  ).toContainText("Can use");
});

test("People section: switching to everyone is confirm-gated when it drops a Manager", async ({
  page,
  request,
}) => {
  await armCapabilities(request, OWNER_CAPS);
  // Cara is an agent Manager; the everyone sentinel cannot carry that grant, so
  // the switch must ask before discarding it.
  await request.post(`${FAKE_HOST_URL}/__test__/org`, {
    data: {
      members: [
        ...ROSTER,
        { userId: "u-cara", email: "cara@acme.test", role: "admin" },
      ],
      agents: [
        {
          id: "agent-finance",
          name: "Finance Bot",
          assignments: [
            { userId: "u-self", access: "manager" },
            { userId: "u-cara", access: "manager" },
          ],
        },
      ],
    },
  });
  await openFinance(page);

  // The VIEWER is the org owner, so they keep their own Manager seat: this is
  // the informational confirm, not the destructive self-lockout one. (The
  // self-lockout branch can't be driven here — identity is off in this project,
  // so `useSession()` is null and nothing ever resolves as "self"; it is proven
  // in `app/tests/agent-people-choice.test.ts` instead.)
  await page.getByRole("radio", { name: "Everyone on your team" }).click();
  await expect(
    page.getByRole("heading", { name: "Give everyone access?" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Yes, give everyone access" }).click();
  await expect(
    page.getByRole("radio", { name: "Everyone on your team" }),
  ).toBeChecked();

  // The write landed: Cara keeps access, now as a plain member of the team.
  await openFinance(page);
  await expect(
    page.getByRole("radio", { name: "Everyone on your team" }),
  ).toBeChecked();
  await expect(
    page.getByRole("listitem").filter({ hasText: "cara@acme.test" }),
  ).toContainText("Can use");
});

test("a visible-but-not-manager admin drills into the SAME page, read-only", async ({
  page,
  request,
}) => {
  // Previously a dead-end note. An admin who can see the agent but does not
  // manage it now reads every section, with no dead affordances.
  await armCapabilities(request, {
    multiplayer: true,
    teams: true,
    role: "admin",
  });
  await request.post(`${FAKE_HOST_URL}/__test__/org`, {
    data: {
      members: [
        { userId: "u-self", email: "you@acme.test", role: "admin" },
        { userId: "u-bob", email: "bob@acme.test", role: "user" },
      ],
      agents: [
        {
          id: "agent-finance",
          name: "Finance Bot",
          access: "user",
          assignments: [{ userId: "u-bob", access: "user" }],
        },
      ],
    },
  });
  await openFinance(page);

  // The rail and the People question are there; the controls are not.
  await expect(railItem(page, "People with access")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Who can use this agent?" }),
  ).toBeVisible();
  await expect(
    page.getByText("Someone who manages this agent can change who has access."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Change access for bob@acme.test" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("radio", { name: "Only specific people" }),
  ).toBeDisabled();
});

test("Apps section: the app ceiling narrows and persists", async ({
  page,
  request,
}) => {
  await armCapabilities(request, OWNER_CAPS);
  await armOrg(request);
  await openFinance(page);
  await railItem(page, "Apps").click();

  await expect(
    page.getByRole("heading", { name: "Which apps can this agent use?" }),
  ).toBeVisible();

  // Starts unrestricted (null): "Any app" is the checked mode.
  await expect(page.getByRole("radio", { name: "Any app" })).toBeChecked();

  // Restrict it -> a PUT /v1/agents/:slug/settings persists the ceiling.
  await page.getByRole("radio", { name: "Only apps you pick" }).click();
  await expect(
    page.getByRole("radio", { name: "Only apps you pick" }),
  ).toBeChecked();

  // GET round-trip: a full reload re-reads the agent settings from the host.
  await openFinance(page);
  await railItem(page, "Apps").click();
  await expect(
    page.getByRole("radio", { name: "Only apps you pick" }),
  ).toBeChecked();
});

test("AI models section: the model ceiling editor is present", async ({
  page,
  request,
}) => {
  await armCapabilities(request, OWNER_CAPS);
  await armOrg(request);
  await openFinance(page);
  await railItem(page, "AI models").click();

  await expect(
    page.getByRole("heading", { name: "Which AI models can this agent use?" }),
  ).toBeVisible();
});

test("Context group: the agent's job description and Memory live on the same page", async ({
  page,
  request,
}) => {
  await armCapabilities(request, OWNER_CAPS);
  await armOrg(request);
  await openFinance(page);

  await railItem(page, "Job description").click();
  await expect(railItem(page, "Job description")).toHaveAttribute(
    "aria-current",
    "page",
  );

  await railItem(page, "Memory").click();
  await expect(railItem(page, "Memory")).toHaveAttribute(
    "aria-current",
    "page",
  );
});

/**
 * The same access sections mount when the agent is opened through TEAM
 * SETTINGS, which only the workspace owner and org admins see. A plain member
 * gets no Team Settings row at all, so the whole configure surface is out of
 * reach for them rather than half-shown.
 */

test("agent settings via Team Settings: a manager gets editable access controls, and a People change round-trips", async ({
  page,
  request,
}) => {
  await armCapabilities(request, OWNER_CAPS);
  await armOrg(request);
  await openAgentSettingsPage(page);

  await railItem(page, "People with access").click();

  // People is default; the manager edits Bob's access right on the agent.
  const bob = page.getByRole("button", {
    name: "Change access for bob@acme.test",
  });
  await expect(bob).toContainText("Can use");
  await bob.click();
  await page.getByRole("menuitem", { name: /No access/ }).click();
  await expect(bob).toContainText("No access");

  // GET round-trip: a full reload re-reads /agents; the write reached the gateway.
  await openAgentSettingsPage(page);
  await railItem(page, "People with access").click();
  await expect(
    page.getByRole("button", { name: "Change access for bob@acme.test" }),
  ).toContainText("No access");
});

test("a plain member cannot reach the agent settings page at all", async ({
  page,
  request,
}) => {
  await armCapabilities(request, MEMBER_CAPS);
  // The member can only USE this agent (access "user"), so the manager
  // surfaces must not exist for them at all (PRODUCT-1256).
  await request.post(`${FAKE_HOST_URL}/__test__/org`, {
    data: {
      agents: [
        {
          id: "agent-finance",
          name: "Finance Bot",
          access: "user",
          assignments: [{ userId: "u-bob", access: "user" }],
        },
      ],
    },
  });
  await page.goto("/");
  await expect(page.getByText("Your teams")).toBeVisible();

  // The team's WORK is theirs — Mission Control, Routines, Files — but the one
  // section that CONFIGURES is not, and the agent settings page has no other
  // door. A row they cannot use would be a dead link, so there is no row.
  const rows = rail(page).locator("[data-sidebar-section-row]");
  await expect(
    rows.filter({ hasText: "Mission Control" }).first(),
  ).toBeVisible();
  await expect(rows.filter({ hasText: "Team Settings" })).toHaveCount(0);
});

test("Admin People roster shows a member's gateway display name, email as a secondary line", async ({
  page,
  request,
}) => {
  await armCapabilities(request, OWNER_CAPS);
  // Arm a roster where Bob carries the gateway-stored GCIP display name; the
  // owner keeps only an email (never set a name), proving the fallback too.
  await request.post(`${FAKE_HOST_URL}/__test__/org`, {
    data: {
      members: [
        { userId: "u-self", email: "you@acme.test", role: "owner" },
        {
          userId: "u-bob",
          email: "bob@acme.test",
          role: "user",
          displayName: "Bob Q. Public",
        },
      ],
    },
  });

  await page.goto("/");
  await openSettingsSection(page, "organization");
  await page.getByRole("button", { name: /People/ }).click();

  // Bob's display name is the primary label; his email drops to a muted
  // secondary line — the gateway-backed profile lit up the roster row.
  await expect(page.getByText("Bob Q. Public")).toBeVisible();
  await expect(page.getByText("bob@acme.test")).toBeVisible();
  // The owner has no display name, so the row still shows the email as primary.
  await expect(page.getByText("you@acme.test")).toBeVisible();
});
