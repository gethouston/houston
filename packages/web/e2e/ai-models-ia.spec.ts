import { FAKE_HOST_URL } from "@houston/fake-host";
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";

/**
 * The AI-models permissioning information architecture — the model-side twin of
 * `integrations-ia.spec.ts`. Each concept has one home:
 *  - POLICY (the allowed-models ceiling) is PER AGENT only → the Permissions
 *    view, in each agent's per-agent drill-in (its AI Models tab). The old
 *    workspace-wide
 *    "Defaults for every agent" model ceiling was removed as overengineering, and
 *    the AI Models hub's "Workspace policy" tab stays gone — the hub keeps only
 *    Providers / Models. AI provider connections are org-level (C6), so a plain
 *    member has no account or policy to act on in the hub and loses its nav.
 *  - Each member's own model pick lives in the composer, not the hub.
 *
 * The Teams-shaped state single-player can't reach is armed via the fake host's
 * `/__test__/capabilities` (advertise `multiplayer` + `teams` + a `role`) and
 * `/__test__/agent-settings` (the agent model ceiling); the `/v1/org` view load
 * is served by the fake host. See `@houston/fake-host` README +
 * `knowledge-base/ui-testing.md`.
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

/** Open the Permissions view (the agent list is the top level; per-agent
 *  ceilings live in each agent's drill-in). */
async function openPermissions(page: Page): Promise<void> {
  await page.goto("/");
  await page.locator('[data-tour-target="nav-permissions"]').click();
}

// ── 1. The AI hub dropped the Workspace policy tab ─────────────────────────

test("Teams owner: the AI hub keeps only Providers / Models, the Workspace policy tab is gone", async ({
  page,
  request,
}) => {
  // Model policy is per agent (in the Permissions view), never a hub tab, so the
  // owner finds only the two browse tabs in the hub.
  await armCapabilities(request, OWNER_CAPS);
  await page.goto("/");
  await page.locator('[data-tour-target="nav-ai-hub"]').click();

  await expect(page.getByRole("tab", { name: "Providers" })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Models/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Workspace policy" })).toHaveCount(
    0,
  );
});

// ── 2. Plain member: no AI Models nav ──────────────────────────────────────

test("Teams member: the AI Models nav item is gone, the rest of the shell stays", async ({
  page,
  request,
}) => {
  // A plain member never sees the hub: providers are org-level and the model
  // policy is per-agent, manager-owned. They pick their own model per agent in
  // the composer.
  await armCapabilities(request, { ...OWNER_CAPS, role: "user" });
  await page.goto("/");

  await expect(page.locator('[data-tour-target="nav-ai-hub"]')).toHaveCount(0);
  // Mission Control and Settings remain — only AI Models is gated off.
  await expect(
    page.locator('[data-tour-target="nav-dashboard"]'),
  ).toBeVisible();
  await expect(page.locator('[data-tour-target="nav-settings"]')).toBeVisible();
});

// ── 3. Per-agent model ceiling editor ──────────────────────────────────────

test("Permissions: a per-agent model ceiling offers the full catalog (no org narrowing)", async ({
  page,
  request,
}) => {
  // Policy is per agent only: a manager narrowing the agent's model ceiling picks
  // from the WHOLE catalog — there is no workspace-wide ceiling to narrow it, so
  // every model (Opus AND Sonnet) is offerable. The per-agent ceilings live in the
  // Permissions view's per-agent drill-in (its AI Models tab).
  await armCapabilities(request, OWNER_CAPS);
  await request.post(`${FAKE_HOST_URL}/__test__/org`, {
    data: {
      members: [{ userId: "u-self", email: "you@acme.test", role: "owner" }],
      agents: [
        {
          id: "agent-finance",
          name: "Finance Bot",
          assignments: [{ userId: "u-self", access: "manager" }],
        },
      ],
    },
  });
  await openPermissions(page);
  await page.getByRole("button", { name: "Open Finance Bot" }).click();
  await page.getByRole("tab", { name: "AI Models" }).click();

  // The per-agent card shows the model ceiling question, starting unrestricted.
  await expect(
    page.getByRole("heading", { name: "Which AI models can this agent use?" }),
  ).toBeVisible();

  // Restrict the agent's model ceiling, revealing the "Add models" list, then
  // assert both models are offerable — no org ceiling narrows the universe.
  await page.getByRole("radio", { name: "Only models you pick" }).click();
  await expect(page.getByRole("heading", { name: "Add models" })).toBeVisible();
  await expect(page.getByText(/Opus/i).first()).toBeVisible();
  await expect(page.getByText(/Sonnet/i).first()).toBeVisible();
});
