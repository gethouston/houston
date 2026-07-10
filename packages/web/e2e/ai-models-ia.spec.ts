import { FAKE_HOST_URL } from "@houston/fake-host";
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";

/**
 * The AI-models permissioning information architecture — the model-side twin of
 * `integrations-ia.spec.ts`. Each concept has one home:
 *  - POLICY (the org-wide allowed-models ceiling) → the AI Models hub's
 *    "Workspace policy" tab, an owner/admin surface (owner edits, admin
 *    read-only). AI provider connections are org-level (C6), so a plain member
 *    has no account or policy to act on in the hub and loses its nav entirely —
 *    exactly as they lose the Integrations nav.
 *  - Each member's own model pick lives in the composer, not the hub.
 *
 * The Teams-shaped state single-player can't reach is armed via the fake host's
 * `/__test__/capabilities` (advertise `multiplayer` + `teams` + a `role`) and
 * `/__test__/agent-settings` (the agent/org model ceilings); the
 * `/v1/org/settings` gateway route backs the owner's saves. See
 * `@houston/fake-host` README + `knowledge-base/ui-testing.md`.
 */

/** Teams owner: multiplayer + Teams, top role. */
const OWNER_CAPS = {
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

/** Arm the Teams ceilings the gateway serves (the org model ceiling lives here). */
async function armAgentSettings(
  request: APIRequestContext,
  settings: Record<string, unknown>,
): Promise<void> {
  await request.post(`${FAKE_HOST_URL}/__test__/agent-settings`, {
    data: settings,
  });
}

async function openWorkspacePolicy(page: Page): Promise<void> {
  await page.goto("/");
  await page.locator('[data-tour-target="nav-ai-hub"]').click();
  await page.getByRole("tab", { name: "Workspace policy" }).click();
}

// ── 1. Owner policy editor ─────────────────────────────────────────────────

test("Teams owner: the AI hub's Workspace policy tab is the org model ceiling editor, and restricting persists", async ({
  page,
  request,
}) => {
  await armCapabilities(request, OWNER_CAPS);
  await openWorkspacePolicy(page);

  // The tab is the org POLICY question — the two-mode choice at rest.
  await expect(
    page.getByRole("heading", {
      name: "Which models can agents in this workspace use?",
    }),
  ).toBeVisible();
  await expect(page.getByRole("radio", { name: "Any model" })).toBeVisible();
  await expect(
    page.getByRole("radio", { name: "Only models you pick" }),
  ).toBeVisible();
  // Starts unrestricted (org ceiling is null): "Any model" is the checked mode
  // and no allowed-models list exists yet.
  await expect(page.getByRole("radio", { name: "Any model" })).toBeChecked();
  await expect(page.getByText("Allowed models")).toHaveCount(0);

  // Owner picks "Only models you pick" → a PUT /v1/org/settings persists the
  // ceiling, and the allowed-models list appears.
  await page.getByRole("radio", { name: "Only models you pick" }).click();
  await expect(page.getByText("Allowed models")).toBeVisible();
  await expect(
    page.getByRole("radio", { name: "Only models you pick" }),
  ).toBeChecked();

  // GET round-trip: a full reload re-reads /v1/org/settings from the host, and
  // the ceiling is still restricted — the save reached the gateway, not just the
  // client cache.
  await page.reload();
  await page.locator('[data-tour-target="nav-ai-hub"]').click();
  await page.getByRole("tab", { name: "Workspace policy" }).click();
  await expect(
    page.getByRole("radio", { name: "Only models you pick" }),
  ).toBeChecked();
  await expect(page.getByText("Allowed models")).toBeVisible();
});

// ── 2. Admin read-only ─────────────────────────────────────────────────────

test("Teams admin: the model policy editor is read-only with an owner-only note and no add list", async ({
  page,
  request,
}) => {
  // An admin sees the SAME policy tab, but every control is read-only (only the
  // owner may change the org ceiling). Arm a restricted ceiling so the page has
  // an allowed list an owner could extend, then confirm the admin cannot.
  await armCapabilities(request, { ...OWNER_CAPS, role: "admin" });
  await armAgentSettings(request, { orgAllowedModels: ["claude-opus-4-8"] });
  await openWorkspacePolicy(page);

  // The policy question renders, with the owner-only explanation at rest.
  await expect(
    page.getByRole("heading", {
      name: "Which models can agents in this workspace use?",
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Only the workspace owner can change this."),
  ).toBeVisible();

  // The choice control is disabled — the radios cannot be re-picked...
  await expect(page.getByRole("radio", { name: "Any model" })).toBeDisabled();
  await expect(
    page.getByRole("radio", { name: "Only models you pick" }),
  ).toBeDisabled();
  // ...and the "picked" mode stays checked after a click attempt (no write).
  await page
    .getByRole("radio", { name: "Only models you pick" })
    .click({ force: true });
  await expect(
    page.getByRole("radio", { name: "Only models you pick" }),
  ).toBeChecked();

  // The allowed list shows (read-only), but the "Add models" list an owner uses
  // to widen the ceiling is absent for an admin.
  await expect(page.getByText("Allowed models")).toBeVisible();
  await expect(page.getByText("Add models")).toHaveCount(0);
});

// ── 3. Plain member: no AI Models nav ──────────────────────────────────────

test("Teams member: the AI Models nav item is gone, the rest of the shell stays", async ({
  page,
  request,
}) => {
  // A plain member never sees the hub: providers are org-level and the model
  // policy is admin-owned. They pick their own model per agent in the composer.
  await armCapabilities(request, { ...OWNER_CAPS, role: "user" });
  await page.goto("/");

  await expect(page.locator('[data-tour-target="nav-ai-hub"]')).toHaveCount(0);
  // Mission Control and Settings remain — only AI Models is gated off.
  await expect(
    page.locator('[data-tour-target="nav-dashboard"]'),
  ).toBeVisible();
  await expect(page.locator('[data-tour-target="nav-settings"]')).toBeVisible();
});

// ── 4. Per-agent editor reflects the org ceiling ───────────────────────────

test("Agent Settings > AI models: the addable set is narrowed to the org ceiling", async ({
  page,
  request,
}) => {
  // Org ceiling allows only Claude Opus; the agent's own ceiling is unrestricted.
  // A manager narrowing the agent may only pick from the org-allowed models, so
  // an org-disallowed model (Claude Sonnet) is never offered for the agent.
  await armCapabilities(request, OWNER_CAPS);
  await armAgentSettings(request, { orgAllowedModels: ["claude-opus-4-8"] });
  await page.goto("/");
  await page.locator('[data-tour-target="tab-job-description"]').click();

  // Open the Access group's "AI models" section (scoped to the settings rail so
  // it never matches the top-level AI Models nav item).
  await page
    .getByRole("navigation", { name: "Agent settings" })
    .getByRole("button", { name: "AI models" })
    .click();

  // Restrict, revealing the "Add models" list, then assert the org narrowing:
  // Opus (org-allowed) is offerable, Sonnet (org-disallowed) is not.
  await page.getByRole("radio", { name: "Only models you pick" }).click();
  await expect(page.getByRole("heading", { name: "Add models" })).toBeVisible();
  await expect(page.getByText(/Opus/i).first()).toBeVisible();
  await expect(page.getByText(/Sonnet/i)).toHaveCount(0);
});
