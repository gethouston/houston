import { FAKE_HOST_URL } from "@houston/fake-host";
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import {
  openSettings,
  openSettingsSection,
  settingsRow,
} from "./support/settings-nav";

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
 *  - USAGE (how much of each connected AI account is left) belongs to the
 *    account, so it renders on the hub's Connected row. There is no separate
 *    usage screen anywhere (HOU-789).
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

/** Open Settings > Permissions (the agent list is the top level; per-agent
 *  ceilings live in each agent's drill-in). */
async function openPermissions(page: Page): Promise<void> {
  await page.goto("/");
  await openSettingsSection(page, "permissions");
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

// ── 4. Account usage has exactly one home ──────────────────────────────────

test("account usage renders on the hub's Connected row and nowhere else", async ({
  page,
  request,
}) => {
  await armCapabilities(request, OWNER_CAPS);
  // An account whose usage probe has no readable credential: the row must SAY
  // so. Falling back to a blank meter would claim a reading Houston never got.
  await request.post(`${FAKE_HOST_URL}/__test__/provider-usage`, {
    data: {
      rows: [{ provider: "anthropic", status: "unauthenticated", windows: [] }],
    },
  });
  await page.goto("/");
  await page.locator('[data-tour-target="nav-ai-hub"]').click();

  await expect(
    page.getByText("Sign in again to see this account's usage."),
  ).toBeVisible();

  // And Settings offers no usage screen to compete with it. Asserted as the
  // EXACT set of drill-in rows the index carries, so a re-added usage screen
  // fails here whatever it gets called — the old `settings-row-usage` testid no
  // longer exists anywhere, and an assertion on a name nothing can produce
  // cannot fail. On this gateway that set is Guide me (the Help action row) +
  // Admin + Permissions: Time worked rides `capabilities.computeUsage`, which
  // the fake host does not advertise.
  await openSettings(page);
  await expect(page.locator('[data-testid^="settings-row-"]')).toHaveCount(3);
  await expect(page.getByTestId("settings-row-guide-me")).toBeVisible();
  await expect(settingsRow(page, "organization")).toBeVisible();
  await expect(settingsRow(page, "permissions")).toBeVisible();
  await expect(settingsRow(page, "time-worked")).toHaveCount(0);
});
