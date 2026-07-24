import { FAKE_HOST_URL } from "@houston/fake-host";
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";

/**
 * Permissions is FULLY AGENT-CENTRIC: the top level is the agent list, and
 * opening an agent shows three tabs — People (who can use this agent, at what
 * level), Integrations (its app ceiling), and AI Models (its model ceiling).
 * There is no top-level People tab and no per-person lens.
 *
 * This proves the whole shape: the list renders, drilling in shows the three
 * tabs, a People access change (Can use -> No access) set-replaces the roster via
 * `PUT /v1/agents/:slug/assignments`, and an Integrations ceiling narrow persists
 * via `PUT /v1/agents/:slug/settings` — each verified with a full reload so the
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

/** Open the Permissions view (the agent list is the top level). */
async function openPermissions(page: Page): Promise<void> {
  await page.goto("/");
  await page.locator('[data-tour-target="nav-permissions"]').click();
}

/** Open Permissions and drill into Finance Bot. */
async function openFinance(page: Page): Promise<void> {
  await openPermissions(page);
  await page.getByRole("button", { name: "Open Finance Bot" }).click();
}

/**
 * Open the agent workspace's OWN Permissions tab (the same three-tab surface,
 * mounted on the agent). Keyed by the tab's stable tour anchor, since a top-level
 * "Permissions" sidebar nav shares the label for owner/admin.
 */
async function openAgentPermissionsTab(page: Page): Promise<void> {
  await page.goto("/");
  await page.locator('[data-tour-target="tab-agent-permissions"]').click();
}

test("the agent list is the top level, and opening an agent shows the three tabs", async ({
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

  // Three tabs: People, Integrations, AI Models.
  await expect(page.getByRole("tab", { name: "People" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Integrations" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "AI Models" })).toBeVisible();
});

test("People tab: every member has a row, and a Can use -> No access change round-trips", async ({
  page,
  request,
}) => {
  await armCapabilities(request, OWNER_CAPS);
  await armOrg(request);
  await openFinance(page);

  // People is the default tab. The owner is static; Bob has an editable control
  // showing his current level (Can use).
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

test("Integrations tab: the app ceiling narrows and persists", async ({
  page,
  request,
}) => {
  await armCapabilities(request, OWNER_CAPS);
  await armOrg(request);
  await openFinance(page);
  await page.getByRole("tab", { name: "Integrations" }).click();

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
  await page.getByRole("tab", { name: "Integrations" }).click();
  await expect(
    page.getByRole("radio", { name: "Only apps you pick" }),
  ).toBeChecked();
});

test("AI Models tab: the model ceiling editor is present", async ({
  page,
  request,
}) => {
  await armCapabilities(request, OWNER_CAPS);
  await armOrg(request);
  await openFinance(page);
  await page.getByRole("tab", { name: "AI Models" }).click();

  await expect(
    page.getByRole("heading", { name: "Which AI models can this agent use?" }),
  ).toBeVisible();
});

/**
 * The SAME three-tab surface also mounts ON the agent as its own Permissions tab,
 * Teams-gated and visible to EVERYONE who can open the agent — editable for a
 * manager, read-only for a member — so a user always sees why their agent can or
 * can't use something (two fronts, one target).
 */

test("agent Permissions tab: a manager gets the editable panel, and a People change round-trips", async ({
  page,
  request,
}) => {
  await armCapabilities(request, OWNER_CAPS);
  await armOrg(request);
  await openAgentPermissionsTab(page);

  // The same three sub-tabs the top-level drill-in shows.
  await expect(page.getByRole("tab", { name: "People" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Integrations" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "AI Models" })).toBeVisible();

  // People is default; the manager edits Bob's access right on the agent.
  const bob = page.getByRole("button", {
    name: "Change access for bob@acme.test",
  });
  await expect(bob).toContainText("Can use");
  await bob.click();
  await page.getByRole("menuitem", { name: /No access/ }).click();
  await expect(bob).toContainText("No access");

  // GET round-trip: a full reload re-reads /agents; the write reached the gateway.
  await openAgentPermissionsTab(page);
  await expect(
    page.getByRole("button", { name: "Change access for bob@acme.test" }),
  ).toContainText("No access");
});

test("agent Permissions tab: a plain member sees it read-only (states visible, no controls)", async ({
  page,
  request,
}) => {
  await armCapabilities(request, MEMBER_CAPS);
  // The member can only USE this agent (access "user"); the gateway serves them
  // no roster (owner/admin only), so the People tab must degrade honestly.
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
  await openAgentPermissionsTab(page);

  // The tab is present (Teams-gated, everyone) with the three sub-tabs.
  await expect(page.getByRole("tab", { name: "People" })).toBeVisible();

  // People degrades to the honest viewer line — no roster, and NO access control.
  await expect(
    page.getByText(
      "You can use this agent. Someone who manages it can change who has access.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Change access/ })).toHaveCount(
    0,
  );

  // Integrations is read-only too: the ceiling shows, but its choice is disabled.
  await page.getByRole("tab", { name: "Integrations" }).click();
  await expect(
    page.getByRole("heading", { name: "Which apps can this agent use?" }),
  ).toBeVisible();
  await expect(page.getByRole("radio", { name: "Any app" })).toBeDisabled();
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
  await page.locator('[data-tour-target="nav-organization"]').click();
  await page.getByRole("button", { name: /People/ }).click();

  // Bob's display name is the primary label; his email drops to a muted
  // secondary line — the gateway-backed profile lit up the roster row.
  await expect(page.getByText("Bob Q. Public")).toBeVisible();
  await expect(page.getByText("bob@acme.test")).toBeVisible();
  // The owner has no display name, so the row still shows the email as primary.
  await expect(page.getByText("you@acme.test")).toBeVisible();
});
