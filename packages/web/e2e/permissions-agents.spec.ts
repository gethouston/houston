import { FAKE_HOST_URL } from "@houston/fake-host";
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";

/**
 * Permissions > Agents: the one home for what each agent is ALLOWED to use.
 * Policy is per agent only (the workspace-wide "Defaults for every agent" card
 * was removed as overengineering), so the tab is just the agent list; opening an
 * agent drills into its own per-agent ceilings (integrations + models), and
 * narrowing the app ceiling round-trips to the host via
 * `PUT /v1/agents/:slug/settings`.
 *
 * The Teams-shaped state single-player can't reach is armed via the fake host's
 * `/__test__/capabilities` (multiplayer + Teams + a `role`) and `/__test__/org`
 * (a roster + an agent fleet). The `/v1/agents/:slug/settings` reads/writes are
 * served by the fake host. See `@houston/fake-host` README +
 * `knowledge-base/ui-testing.md`.
 */

/** Teams owner: multiplayer + Teams, top role. */
const OWNER_CAPS = { multiplayer: true, teams: true, role: "owner" };

const ROSTER = [{ userId: "u-self", email: "you@acme.test", role: "owner" }];

/** One agent the owner manages, so its per-agent ceilings are editable. */
const AGENTS = [
  {
    id: "agent-finance",
    name: "Finance Bot",
    assignments: [{ userId: "u-self", access: "manager" }],
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

/** Open the Permissions view's Agents tab. */
async function openAgentsTab(page: Page): Promise<void> {
  await page.goto("/");
  await page.locator('[data-tour-target="nav-permissions"]').click();
  await page.getByRole("tab", { name: "Agents" }).click();
}

test("owner: the Agents tab shows the agent list with no workspace-defaults card", async ({
  page,
  request,
}) => {
  await armCapabilities(request, OWNER_CAPS);
  await armOrg(request);
  await openAgentsTab(page);

  // No workspace-wide "Defaults for every agent" card — policy is per agent only.
  await expect(
    page.getByRole("heading", { name: "Defaults for every agent" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", {
      name: "Which apps can agents in this workspace use?",
    }),
  ).toHaveCount(0);

  // The agent list renders, each tile an open action.
  await expect(
    page.getByRole("button", { name: "Open Finance Bot" }),
  ).toBeVisible();
});

test("owner: opening an agent shows its integration + model ceilings, and the app ceiling round-trips", async ({
  page,
  request,
}) => {
  await armCapabilities(request, OWNER_CAPS);
  await armOrg(request);
  await openAgentsTab(page);
  await page.getByRole("button", { name: "Open Finance Bot" }).click();

  // The per-agent card shows BOTH ceilings for this one agent.
  await expect(
    page.getByRole("heading", { name: "Which apps can this agent use?" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Which AI models can this agent use?" }),
  ).toBeVisible();

  // The app ceiling starts unrestricted (null): "Any app" is the checked mode.
  await expect(page.getByRole("radio", { name: "Any app" })).toBeChecked();

  // Restrict it → a PUT /v1/agents/:slug/settings persists the ceiling.
  await page.getByRole("radio", { name: "Only apps you pick" }).click();
  await expect(
    page.getByRole("radio", { name: "Only apps you pick" }),
  ).toBeChecked();

  // GET round-trip: a full reload re-reads the agent settings from the host, and
  // the ceiling is still restricted — the save reached the gateway, not just the
  // client cache.
  await page.reload();
  await openAgentsTab(page);
  await page.getByRole("button", { name: "Open Finance Bot" }).click();
  await expect(
    page.getByRole("radio", { name: "Only apps you pick" }),
  ).toBeChecked();
});
