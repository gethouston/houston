import { FAKE_HOST_URL } from "@houston/fake-host";
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";

/**
 * The integrations permissioning information architecture (the IA end-state).
 * Each concept now has exactly one home:
 *  - POLICY (who can use each agent + what each agent may use — org/agent app
 *    and model ceilings) → the ONE top-level Permissions view (owner/admin).
 *    Covered by `permissions-*.spec.ts`; it is NOT the global Integrations page,
 *    which is always the personal catalog now;
 *  - CATALOG + ACCOUNTS (the caller's personal connected apps) → the global
 *    Integrations page, visible to EVERY role in every mode (a plain member
 *    keeps its nav). Opening a connected app's detail modal shows info +
 *    reconnect + disconnect ONLY — which agents may use an app is managed in one
 *    place, the Permissions view, never here. Settings > Connected accounts is
 *    GONE (no settings row at all; the sidebar nav is the one way in);
 *  - the agent Integrations TAB → a pure connect surface. Usable = connection ∩
 *    the agent's effective allowlist (the per-agent GRANTS layer is gone), so a
 *    connected+allowed app tiles the Installed strip with NO per-agent Switch
 *    anywhere. Browse excludes connected apps, and the tab's app detail dialog
 *    carries no per-agent toggles.
 *
 * The Teams-shaped state single-player can't reach is armed via the fake host's
 * `/__test__/capabilities` (advertise `multiplayer` + `teams` + a `role`)
 * control. See `@houston/fake-host` README + `knowledge-base/ui-testing.md`.
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

async function openIntegrations(page: Page): Promise<void> {
  await page.goto("/");
  await page.locator('[data-tour-target="nav-integrations"]').click();
}

// ── 1. Plain member: no Admin nav, but the personal catalog stays ──────────

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

// ── 2. Integrations page: personal connections only, no agent list ─────────

test("Integrations page: an installed app's detail modal shows no agent list", async ({
  page,
  request,
}) => {
  // Single-player with apps. The seeded (connected) Gmail tiles the Installed
  // strip; browse excludes it, so its tile is the only Gmail affordance. This
  // page is a personal-connections surface now — no per-agent grants anywhere.
  await armCapabilities(request, { integrations: ["composio"] });
  await openIntegrations(page);

  await page.getByRole("button", { name: "Gmail" }).click();

  // The detail modal is info + reconnect + disconnect ONLY: no "Agents that can
  // use this" block and no per-agent Switch — permissions live in one place now.
  await expect(page.getByRole("button", { name: "Disconnect" })).toBeVisible();
  await expect(page.getByText("Agents that can use this")).toHaveCount(0);
  await expect(page.getByRole("switch")).toHaveCount(0);
});

// ── 3. Agent tab is a pure connect surface (no per-agent switches) ──────────

test("Agent Integrations tab: connected apps tile the Installed strip with no per-agent switches", async ({
  page,
  request,
}) => {
  // Usable = connection ∩ allowlist (no ceiling here → all connected apps
  // usable). The seeded Gmail connection tiles the Installed strip; there is no
  // "off for this agent" section and no per-agent Switch anywhere.
  await armCapabilities(request, { integrations: ["composio"] });
  await page.goto("/");
  await page.locator('[data-tour-target="tab-integrations"]').click();

  // The connect catalog still renders (search box + a connectable, not-connected
  // app row)...
  await expect(page.getByPlaceholder("Search integrations...")).toBeVisible();
  await expect(
    page.getByRole("button").filter({ hasText: "Slack" }).first(),
  ).toBeVisible();

  // ...the connected Gmail tiles the Installed strip (a button by app name)...
  await expect(page.getByRole("button", { name: "Gmail" })).toBeVisible();

  // ...and there is NO per-agent grant Switch and no off-for-this-agent section.
  await expect(page.getByRole("switch")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Connected, but off for this agent" }),
  ).toHaveCount(0);
});

test("Agent Integrations tab: the app detail dialog has no per-agent grant toggles", async ({
  page,
  request,
}) => {
  // The connected Gmail tiles the Installed strip. Opening its detail dialog on
  // the tab must NOT expose any per-agent grant block or Switch — the tab is a
  // pure connect surface, never a permission editor.
  await armCapabilities(request, { integrations: ["composio"] });
  await page.goto("/");
  await page.locator('[data-tour-target="tab-integrations"]').click();

  await page.getByRole("button", { name: "Gmail" }).click();

  // The shared detail dialog opens (its Disconnect affordance is present)...
  await expect(page.getByRole("button", { name: "Disconnect" })).toBeVisible();
  // ...but the "Agents that can use this" grant block — and any Switch — is absent.
  await expect(page.getByText("Agents that can use this")).toHaveCount(0);
  await expect(page.getByRole("switch")).toHaveCount(0);
});

// ── 4. Member manage link → the personal Integrations page ─────────────────

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
