import { FAKE_HOST_URL, SEED_TOOLKIT_SLUGS } from "@houston/fake-host";
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";

/**
 * Locked browse rows on a Teams host (Element B). On a Teams deployment with a
 * real effective allowlist the agent Integrations tab no longer HIDES blocked
 * apps (which read as "Houston doesn't support X") — it shows them as read-only
 * LOCKED rows in the browse catalog, capped at 8 with a "+N more" line, and an
 * app inside the ceiling stays connectable. Single-player never renders locks.
 *
 * The Teams-shaped state single-player can't reach is armed via the fake host's
 * `/__test__/capabilities` (advertise `integrations` + `multiplayer` + `teams`)
 * and `/__test__/agent-settings` (the agent/org allowlist ceilings) controls —
 * the same real wire shapes `getAgentSettings` / the `teams` capability feed the
 * frontend. See `@houston/fake-host` README + `knowledge-base/ui-testing.md`.
 */

/** The realistic Teams team-space capabilities: integrations on, multiplayer + Teams. */
const TEAMS_CAPS = {
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

async function armAllowlist(
  request: APIRequestContext,
  settings: {
    allowedToolkits: string[] | null;
    orgAllowedToolkits: string[] | null;
  },
): Promise<void> {
  await request.post(`${FAKE_HOST_URL}/__test__/agent-settings`, {
    data: settings,
  });
}

/** A fresh team member has connected nothing; the seed connects Gmail, so drop it. */
async function clearConnections(request: APIRequestContext): Promise<void> {
  await request.post(`${FAKE_HOST_URL}/v1/integrations/composio/disconnect`, {
    data: { toolkit: "gmail" },
  });
}

async function openIntegrationsTab(page: Page): Promise<void> {
  await page.goto("/");
  // The agent's Integrations TAB (a sidebar "Integrations" nav button shares the
  // label), keyed by its stable tour anchor.
  await page.locator('[data-tour-target="tab-integrations"]').click();
}

test("a blocked app shows as a locked row with the ask-admin line, and clicking does nothing", async ({
  page,
  request,
}) => {
  // Admin enabled every app except Slack: Slack is the sole blocked (locked) app.
  const allowlist = SEED_TOOLKIT_SLUGS.filter((s) => s !== "slack");
  await armCapabilities(request, TEAMS_CAPS);
  await armAllowlist(request, {
    allowedToolkits: allowlist,
    orgAllowedToolkits: null,
  });
  await clearConnections(request);
  await openIntegrationsTab(page);

  // Gmail is inside the ceiling and unconnected → a connectable browse row (a
  // clickable button), NOT locked.
  await expect(
    page.getByRole("button").filter({ hasText: "Gmail" }).first(),
  ).toBeVisible();

  // Slack is outside the ceiling → a locked row under the muted heading, with
  // the ask-your-admin subtitle visible AT REST (no hover gating).
  await expect(page.getByText("Not enabled by your admin")).toBeVisible();
  await expect(page.getByText("Ask your admin to enable Slack")).toBeVisible();

  // The locked row is non-interactive: no button carries Slack (unlike the
  // connectable Gmail row), so there is nothing that could start a connect flow.
  await expect(
    page.getByRole("button").filter({ hasText: "Slack" }),
  ).toHaveCount(0);

  // Clicking the locked row changes nothing — the ask-admin line stays and no
  // connect affordance appears for Slack.
  await page.getByText("Ask your admin to enable Slack").click();
  await expect(page.getByText("Ask your admin to enable Slack")).toBeVisible();
  await expect(
    page.getByRole("button").filter({ hasText: "Slack" }),
  ).toHaveCount(0);
});

test("searching for a blocked app shows its locked row, not the empty state", async ({
  page,
  request,
}) => {
  const allowlist = SEED_TOOLKIT_SLUGS.filter((s) => s !== "slack");
  await armCapabilities(request, TEAMS_CAPS);
  await armAllowlist(request, {
    allowedToolkits: allowlist,
    orgAllowedToolkits: null,
  });
  await clearConnections(request);
  await openIntegrationsTab(page);

  // A query that matches ONLY a blocked app must surface its locked row rather
  // than the "no matching apps" empty state (the search filters before the
  // connectable/locked partition).
  await page.getByPlaceholder("Search integrations...").fill("slack");

  await expect(page.getByText("Ask your admin to enable Slack")).toBeVisible();
  await expect(page.getByText("No matching apps found.")).toHaveCount(0);
});

test("the locked section caps at 8 rows with a +N more line", async ({
  page,
  request,
}) => {
  // Only Gmail allowed → the other 14 seeded apps are blocked. The locked
  // preview caps at 8; the remaining 6 collapse into the "+N more" count line.
  await armCapabilities(request, TEAMS_CAPS);
  await armAllowlist(request, {
    allowedToolkits: ["gmail"],
    orgAllowedToolkits: null,
  });
  await clearConnections(request);
  await openIntegrationsTab(page);

  await expect(page.getByText("Not enabled by your admin")).toBeVisible();

  // Exactly 8 locked rows are shown (each carries the ask-admin subtitle)...
  await expect(page.getByText(/^Ask your admin to enable /)).toHaveCount(8);
  // ...and the overflow (14 blocked − 8 shown = 6) folds into the count line.
  await expect(
    page.getByText("6 more apps your admin hasn't enabled"),
  ).toBeVisible();
});

test("single-player: the browse catalog renders but no locked section ever appears", async ({
  page,
  request,
}) => {
  // Integrations available, but NOT a Teams host: no allowlist ceiling exists,
  // so the browse catalog is fully connectable and locks never render.
  await armCapabilities(request, { integrations: ["composio"] });
  await openIntegrationsTab(page);

  // The catalog is live — an unconnected app is a connectable browse row.
  await expect(
    page.getByRole("button").filter({ hasText: "Slack" }).first(),
  ).toBeVisible();
  // No lock treatment anywhere.
  await expect(page.getByText("Not enabled by your admin")).toHaveCount(0);
});
