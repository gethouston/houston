import { FAKE_HOST_URL } from "@houston/fake-host";
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { openAdminSection } from "./support/settings-nav";
import {
  agentSectionTab,
  expectTeamSections,
  openAgentScreen,
  openAgentSettings,
} from "./support/team-nav";

/**
 * Agent POLICY: who may use an agent, and what the agent itself may reach.
 *
 * It is discovered through the focused agent screen.
 *
 * The page itself is fully agent-centric: seven section lozenges across its
 * drilled header, and the selected section below. There is no
 * top-level People tab and no per-person lens.
 *
 * This proves the whole shape: the team lists its agents, drilling in shows the
 * rail, the team-wide access choice writes the everyone sentinel, a People
 * access change (Can use -> No access) set-replaces the roster via
 * `PUT /v1/agents/:slug/assignments`, and an Apps ceiling narrow persists via
 * `PUT /v1/agents/:slug/settings` — each verified with a full reload so the
 * write reached the gateway, not just the client cache. A plain member gets no
 * "Agent settings" lozenge at all, so the whole configure surface is out of reach for
 * them rather than half-shown.
 *
 * The Teams-shaped state single-player can't reach is armed via the fake host's
 * `/__test__/capabilities` (multiplayer + Teams + a `role`) and `/__test__/org`
 * (a multi-member roster + an agent fleet with per-agent assignments). See
 * `@houston/fake-host` README + `packages/web/e2e/README.md`.
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

/**
 * Boot and open the armed agent's canonical settings page through the ONE door:
 * its team's focused agent screen, then its row. `armOrg` replaces the
 * roster, so the team holds Finance Bot rather than the seed agent.
 *
 * Called again mid-test on purpose: every round-trip assertion below re-runs it
 * so the read comes from a fresh page against the host, not the client cache.
 */
async function openFinance(page: Page): Promise<void> {
  await page.goto("/");
  // Straight to People with access: the page itself lands on Settings (the
  // manage section), but the policy assertions below all live here.
  await openAgentSettings(page, "Finance Bot", "People");
}

test("the team's agent list drills into seven settings lozenges", async ({
  page,
  request,
}) => {
  await armCapabilities(request, OWNER_CAPS);
  await armOrg(request);
  await page.goto("/");
  await openAgentSettings(page, "Finance Bot", "Integrations");
  await expect(
    page.locator('[data-agent-section-body="integrations"]'),
  ).toBeVisible();
  await openAgentSettings(page, "Finance Bot", null);

  // Seven top lozenges replace the old grouped rail.
  await expect(page.getByRole("tab", { name: "People" })).toHaveCount(0);
  for (const section of [
    "Job description",
    "Skills",
    "Learnings",
    "People",
    "Integrations",
    "AI Models",
    "Settings",
  ] as const) {
    await expect(agentSectionTab(page, section)).toBeVisible();
  }
  // The drill-in lands on Settings: the page's one door is administering the
  // agent, so it opens on the manage section rather than the first lozenge.
  await expect(
    page.locator('[data-agent-section-body="manage"]'),
  ).toBeVisible();
  // The manage card carries the copy door alongside identity, move and delete.
  await expect(page.getByRole("button", { name: /Copy agent/ })).toBeVisible();
});

test("Copy agent opens pre-named with the first free name and refuses a taken one", async ({
  page,
  request,
}) => {
  await armCapabilities(request, OWNER_CAPS);
  await armOrg(request);
  await page.goto("/");
  await openAgentSettings(page, "Finance Bot", null);
  await page.getByRole("button", { name: /Copy agent/ }).click();

  // Names are unique per workspace (not per team), so the dialog opens on the
  // first free "<name> copy" instead of a name the create would 409 on.
  const nameField = page.locator("#agent-copy-name");
  await expect(nameField).toHaveValue("Finance Bot copy");
  await expect(page.getByRole("button", { name: "Create copy" })).toBeEnabled();

  // Typing a taken name (copying next to the original keeps the original's
  // name taken) names the conflict inline and disables the create.
  await nameField.fill("Finance Bot");
  await expect(
    page.getByText("An agent named Finance Bot already exists"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create copy" }),
  ).toBeDisabled();
});

test("People section: every member has a row, and a Can use -> No access change round-trips", async ({
  page,
  request,
}) => {
  await armCapabilities(request, OWNER_CAPS);
  await armOrg(request);
  await openFinance(page);

  // The owner is static; Bob has an editable control showing his current
  // level (Can use).
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

test("a visible-but-not-manager admin is offered no settings door at all", async ({
  page,
  request,
}) => {
  // The settings page has ONE face and it is the manager's. An admin who can
  // see the agent but does not manage it gets the agent's WORK and no
  // configure door: a read-only rendering of an editing surface is a page full
  // of controls that refuse, so the lozenge that opens it is simply not drawn.
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
  await page.goto("/");
  await openAgentScreen(page, "Finance Bot");

  // Their agent screen carries the work sections and stops there.
  await expectTeamSections(page, ["Tasks", "Routines", "Files"]);
  // And with no door, none of the page behind it is reachable or rendered.
  await expect(agentSectionTab(page, "People")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Allowed People" }),
  ).toHaveCount(0);
});

test("Apps section: the app ceiling narrows and persists", async ({
  page,
  request,
}) => {
  await armCapabilities(request, OWNER_CAPS);
  await armOrg(request);
  await openFinance(page);
  await agentSectionTab(page, "Integrations").click();

  await expect(
    page.getByRole("heading", { name: "Allowed Integrations" }),
  ).toBeVisible();
  await expect(
    page.getByText("Which integrations can this agent use?"),
  ).toBeVisible();

  // Starts unrestricted (null): the allow-all option is checked.
  await expect(
    page.getByRole("radio", { name: "Allow all integrations" }),
  ).toBeChecked();

  // Restrict it -> a PUT /v1/agents/:slug/settings persists the ceiling.
  await page.getByRole("radio", { name: "Only integrations you pick" }).click();
  await expect(
    page.getByRole("radio", { name: "Only integrations you pick" }),
  ).toBeChecked();

  // GET round-trip: a full reload re-reads the agent settings from the host.
  await openFinance(page);
  await agentSectionTab(page, "Integrations").click();
  await expect(
    page.getByRole("radio", { name: "Only integrations you pick" }),
  ).toBeChecked();
});

test("AI models section: the model ceiling editor is present", async ({
  page,
  request,
}) => {
  await armCapabilities(request, OWNER_CAPS);
  await armOrg(request);
  await openFinance(page);
  await agentSectionTab(page, "AI Models").click();

  await expect(
    page.getByRole("heading", { name: "Allowed AI Models" }),
  ).toBeVisible();
  await expect(
    page.getByText("Which AI models can this agent use?"),
  ).toBeVisible();
});

test("Job description and Memory live on the same drilled page", async ({
  page,
  request,
}) => {
  await armCapabilities(request, OWNER_CAPS);
  await armOrg(request);
  await openFinance(page);

  await agentSectionTab(page, "Job description").click();
  await expect(agentSectionTab(page, "Job description")).toHaveAttribute(
    "aria-current",
    "page",
  );

  await agentSectionTab(page, "Learnings").click();
  await expect(agentSectionTab(page, "Learnings")).toHaveAttribute(
    "aria-current",
    "page",
  );
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

  // The team's WORK is theirs — Tasks, Routines, Files — but the one section
  // that CONFIGURES is not, and the agent settings page has no other door:
  // `visibleTeamSectionsForTeam` withholds "focused agent screen", and there is no
  // top-level Permissions screen to reach the page around it any more. A
  // lozenge they cannot use would be a dead link, so the strip does not draw
  // one. (The sections are the team screen's own lozenge cluster now; the rail
  // names teams and nothing else.)
  await expectTeamSections(page, ["Tasks", "Routines", "Files"]);
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
  await openAdminSection(page, "People");

  // Bob's display name is the primary label; his email drops to a muted
  // secondary line — the gateway-backed profile lit up the roster row.
  await expect(page.getByText("Bob Q. Public")).toBeVisible();
  await expect(page.getByText("bob@acme.test")).toBeVisible();
  // The owner has no display name, so the row still shows the email as primary.
  await expect(page.getByText("you@acme.test")).toBeVisible();
});
