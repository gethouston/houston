import { FAKE_HOST_URL, SEED_AGENT_ID } from "@houston/fake-host";
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";

/**
 * The integrations permissioning information architecture (the IA end-state).
 * Each concept now has exactly one home:
 *  - POLICY (org-wide app allowlist) → the Admin page's "Allowed apps" section
 *    (the Organization view, sidebar label "Admin"; a settings-style index of
 *    rows, not a tab strip), an owner/admin surface (owner edits, admin
 *    read-only). It is NOT the global Integrations page, which is always the
 *    personal catalog now;
 *  - CATALOG (the caller's personal connected apps) → the global Integrations
 *    page, visible to EVERY role in every mode (a plain member keeps its nav);
 *  - ACCOUNTS (the user's connected apps + the per-agent grants surface) →
 *    Settings > Connected accounts;
 *  - the agent Integrations TAB → a pure connect surface (no grant toggles).
 *
 * The Teams-shaped state single-player can't reach is armed via the fake host's
 * `/__test__/capabilities` (advertise `multiplayer` + `teams` + a `role`) and
 * `/__test__/agent-settings` (the agent/org allowlist ceilings) controls; the
 * `/v1/org` view load, the `/v1/org/settings` owner saves, and the
 * `/v1/agents/:id/integration-grants` per-agent grant toggles are all served by
 * the fake host. See `@houston/fake-host` README + `knowledge-base/ui-testing.md`.
 */

/** Teams owner: integrations on, multiplayer + Teams, top role. */
const OWNER_CAPS = {
  integrations: ["composio"],
  multiplayer: true,
  teams: true,
  role: "owner",
};

async function armCapabilities(
  request: APIRequestContext,
  caps: Record<string, unknown>,
): Promise<void> {
  await request.post(`${FAKE_HOST_URL}/__test__/capabilities`, { data: caps });
}

/** Arm the Teams ceilings the gateway serves (org allowlist lives here). */
async function armAgentSettings(
  request: APIRequestContext,
  settings: Record<string, unknown>,
): Promise<void> {
  await request.post(`${FAKE_HOST_URL}/__test__/agent-settings`, {
    data: settings,
  });
}

/**
 * Seed a per-agent grant record so the host reports grants SUPPORTED (a present
 * record, even `[]`, is `{toolkits}`; a missing one is a 404 → `null` = the
 * degraded "every agent can use it" mode). The seed agent starts recordless.
 */
async function seedGrants(
  request: APIRequestContext,
  toolkits: string[],
): Promise<void> {
  await request.put(
    `${FAKE_HOST_URL}/v1/agents/${SEED_AGENT_ID}/integration-grants`,
    { data: { toolkits } },
  );
}

/**
 * Open the Admin (Organization) view and drill into one of its sections. The
 * Admin page is a settings-style index of self-describing rows (not a tab
 * strip), so each section is a row BUTTON whose accessible name leads with its
 * title; clicking it opens the section's detail screen.
 */
async function openAdminSection(
  page: Page,
  sectionTitle: string,
): Promise<void> {
  await page.goto("/");
  await page.locator('[data-tour-target="nav-organization"]').click();
  await page.getByRole("button", { name: sectionTitle }).click();
}

async function openSettings(page: Page): Promise<void> {
  await page.goto("/");
  await page.locator('[data-tour-target="nav-settings"]').click();
}

// ── 1. Owner policy editor ─────────────────────────────────────────────────

test("Teams owner: the Admin page's Allowed apps section is the org allowlist policy editor, and restricting persists", async ({
  page,
  request,
}) => {
  await armCapabilities(request, OWNER_CAPS);
  await openAdminSection(page, "Allowed apps");

  // The Allowed apps section is the org POLICY question, not the personal
  // connected-apps grid (that lives on the Integrations page now). The two-mode
  // choice (any app vs a picked set) renders at rest.
  await expect(
    page.getByRole("heading", {
      name: "Which apps can agents in this workspace use?",
    }),
  ).toBeVisible();
  await expect(page.getByRole("radio", { name: "Any app" })).toBeVisible();
  await expect(
    page.getByRole("radio", { name: "Only apps you pick" }),
  ).toBeVisible();
  // Starts unrestricted (org ceiling is null): "Any app" is the checked mode and
  // no allowed list exists yet, so the owner's "Add apps" catalog is absent. (We
  // key off "Add apps", not the "Allowed apps" list heading, since the detail
  // screen's own page title is also "Allowed apps".)
  await expect(page.getByRole("radio", { name: "Any app" })).toBeChecked();
  await expect(page.getByRole("heading", { name: "Add apps" })).toHaveCount(0);

  // Owner picks "Only apps you pick" → a PUT /v1/org/settings persists the
  // ceiling, seeded from the apps already in use, and the "Add apps" catalog
  // (owner-only) appears.
  await page.getByRole("radio", { name: "Only apps you pick" }).click();
  await expect(page.getByRole("heading", { name: "Add apps" })).toBeVisible();
  await expect(
    page.getByRole("radio", { name: "Only apps you pick" }),
  ).toBeChecked();

  // GET round-trip: a full reload re-reads /v1/org/settings from the host, and
  // the ceiling is still restricted — the save reached the gateway, not just the
  // client cache.
  await page.reload();
  await page.locator('[data-tour-target="nav-organization"]').click();
  await page.getByRole("button", { name: "Allowed apps" }).click();
  await expect(
    page.getByRole("radio", { name: "Only apps you pick" }),
  ).toBeChecked();
  await expect(page.getByRole("heading", { name: "Add apps" })).toBeVisible();
});

// ── 2. Admin read-only ─────────────────────────────────────────────────────

test("Teams admin: the Allowed apps editor is read-only with an owner-only note and no catalog", async ({
  page,
  request,
}) => {
  // An admin sees the SAME Allowed apps section, but every control is read-only
  // (only the owner may change the org ceiling). Arm a restricted ceiling so the
  // section has an allowed list an owner could extend, then confirm admin cannot.
  await armCapabilities(request, { ...OWNER_CAPS, role: "admin" });
  await armAgentSettings(request, { orgAllowedToolkits: ["gmail"] });
  await openAdminSection(page, "Allowed apps");

  // The policy question renders, with the owner-only explanation at rest.
  await expect(
    page.getByRole("heading", {
      name: "Which apps can agents in this workspace use?",
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Only the workspace owner can change this."),
  ).toBeVisible();

  // The choice control is disabled — the radios cannot be re-picked...
  await expect(page.getByRole("radio", { name: "Any app" })).toBeDisabled();
  await expect(
    page.getByRole("radio", { name: "Only apps you pick" }),
  ).toBeDisabled();
  // ...and the "picked" mode stays checked after a click attempt (no write).
  await page
    .getByRole("radio", { name: "Only apps you pick" })
    .click({ force: true });
  await expect(
    page.getByRole("radio", { name: "Only apps you pick" }),
  ).toBeChecked();

  // The allowed list shows read-only: the one allowed app (Gmail) renders with
  // its allow toggle present but disabled — the sole switch on the surface,
  // since the owner-only "Add apps" catalog is absent for an admin.
  await expect(page.getByRole("switch")).toHaveCount(1);
  await expect(page.getByRole("switch")).toBeDisabled();
  await expect(page.getByRole("heading", { name: "Add apps" })).toHaveCount(0);
});

// ── 3. Plain member: no Admin nav, but the personal catalog stays ──────────

test("Teams member: no Admin nav, but the Integrations nav opens the personal catalog", async ({
  page,
  request,
}) => {
  // A plain member never sees the policy surface: the org ceiling is admin-owned
  // (the Admin page). But the Integrations nav is now unconditional — a member
  // keeps it and manages their own apps from the personal catalog.
  await armCapabilities(request, { ...OWNER_CAPS, role: "user" });
  await page.goto("/");

  // No Admin (Organization) entry for a plain member.
  await expect(
    page.locator('[data-tour-target="nav-organization"]'),
  ).toHaveCount(0);

  // The Integrations nav IS present for a member now (unconditional), and it
  // opens the personal catalog — never the org policy question.
  const integrationsNav = page.locator('[data-tour-target="nav-integrations"]');
  await expect(integrationsNav).toBeVisible();
  await integrationsNav.click();
  await expect(
    page.getByRole("heading", { name: "Integrations", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Which apps can agents in this workspace use?",
    }),
  ).toHaveCount(0);

  // Mission Control and Settings remain too.
  await expect(
    page.locator('[data-tour-target="nav-dashboard"]'),
  ).toBeVisible();
  await expect(page.locator('[data-tour-target="nav-settings"]')).toBeVisible();
});

// ── 4. Settings > Connected accounts (the one grants surface) ──────────────

test("Settings > Connected accounts: a connected app opens the per-agent grant sheet, and toggling round-trips", async ({
  page,
  request,
}) => {
  // Single-player with apps. Seed a grant record so the host reports grants
  // supported (Gmail granted to the seed agent), which lights up the per-agent
  // Switch inside the detail modal.
  await armCapabilities(request, { integrations: ["composio"] });
  await seedGrants(request, ["gmail"]);
  await openSettings(page);

  // The Connected accounts row shows on the Settings index; drill into it.
  await page
    .getByRole("button", { name: /Connected accounts/ })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Connected accounts" }),
  ).toBeVisible();

  // The seeded Gmail connection is listed; open its detail modal.
  await page.getByRole("button", { name: /Gmail/ }).click();

  // The sheet is the ONE grants surface: "Agents that can use this" with a
  // per-agent Switch, checked because Gmail is granted to the seed agent.
  await expect(page.getByText("Agents that can use this")).toBeVisible();
  const agentSwitch = page.getByRole("switch", { name: "Houston" });
  await expect(agentSwitch).toBeChecked();

  // Toggle off, then on — the switch state (a PUT round-trip through the grant
  // routes) follows each click.
  await agentSwitch.click();
  await expect(agentSwitch).not.toBeChecked();
  await agentSwitch.click();
  await expect(agentSwitch).toBeChecked();

  // Persistence: close the sheet and re-open it; the last-saved grant is read
  // back (the switch is still on), proving the toggle hit the host.
  await page.keyboard.press("Escape");
  await expect(page.getByText("Agents that can use this")).toHaveCount(0);
  await page.getByRole("button", { name: /Gmail/ }).click();
  await expect(page.getByRole("switch", { name: "Houston" })).toBeChecked();
});

// ── 5. Agent tab is a pure connect surface ─────────────────────────────────

test("Agent Integrations tab: pure connect surface, no per-agent grant affordances", async ({
  page,
  request,
}) => {
  // Grants supported (a record exists), so the OLD tab would have shown
  // activate/deactivate controls. In the IA end-state those moved to Settings,
  // leaving the tab a connect-only surface.
  await armCapabilities(request, { integrations: ["composio"] });
  await seedGrants(request, ["gmail"]);
  await page.goto("/");
  await page.locator('[data-tour-target="tab-integrations"]').click();

  // The connect catalog still renders (search box + a connectable app row)...
  await expect(page.getByPlaceholder("Search integrations...")).toBeVisible();
  await expect(
    page.getByRole("button").filter({ hasText: "Slack" }).first(),
  ).toBeVisible();

  // ...but NO per-agent grant affordances survive anywhere on the tab.
  await expect(page.getByText("Activate for this agent")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Remove from this agent/ }),
  ).toHaveCount(0);
});

// ── 6. Member manage link → the personal Integrations page ─────────────────

test("Teams member: the agent tab's manage link opens the personal Integrations page", async ({
  page,
  request,
}) => {
  // The global Integrations page is now the personal catalog for every role, so
  // the agent tab's bottom "Manage all integrations" link routes a plain member
  // straight there (never a policy surface).
  await armCapabilities(request, { ...OWNER_CAPS, role: "user" });
  await page.goto("/");
  await page.locator('[data-tour-target="tab-integrations"]').click();

  const manageLink = page.getByRole("button", {
    name: "Manage all integrations",
  });
  await expect(manageLink).toBeVisible();
  await manageLink.click();

  // It lands on the personal Integrations page (the catalog hero), not the org
  // policy question.
  await expect(
    page.getByRole("heading", { name: "Integrations", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Which apps can agents in this workspace use?",
    }),
  ).toHaveCount(0);
});
