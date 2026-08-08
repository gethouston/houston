import { FAKE_HOST_URL } from "@houston/fake-host";
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { openSettings, settingsRow } from "./support/settings-nav";

/**
 * The integrations permissioning information architecture (the IA end-state).
 * Each concept now has exactly one home:
 *  - POLICY (who can use each agent + what each agent may use — org/agent app
 *    and model ceilings) → the ONE Permissions surface, Settings > Permissions
 *    (owner/admin).
 *    Covered by `permissions-*.spec.ts`; it is NOT the global Integrations page,
 *    which is always the personal catalog now;
 *  - CATALOG + ACCOUNTS (the caller's personal connected apps) → the global
 *    Integrations page, visible to EVERY role in every mode (a plain member
 *    keeps its nav). Opening a connected app's detail modal shows info +
 *    reconnect + disconnect ONLY — which agents may use an app is managed in one
 *    place, the Permissions view, never here. Settings > Connected accounts is
 *    GONE (no settings row at all; the sidebar nav is the one way in);
 *
 * The per-agent Integrations TAB is GONE with the agent tab shell: connections
 * are the caller's, not an agent's (Composio platform mode), so the global page
 * is the one catalog, and the agent's app CEILING is the "Apps" section of its
 * settings page (`permissions.spec.ts`).
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

  // No Admin (Organization) row for a plain member. It lives in Settings since
  // HOU-788, so the absence is asserted on the Settings index itself.
  await openSettings(page);
  await expect(settingsRow(page, "organization")).toHaveCount(0);

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
