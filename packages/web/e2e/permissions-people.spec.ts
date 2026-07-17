import { FAKE_HOST_URL } from "@houston/fake-host";
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";

/**
 * Admin > People as a per-person access lens (owner-first). The owner opens
 * Admin > People, clicks a member, and sees that person's agents split into
 * "Shared with everyone" (read-only) and explicit-roster agents (each with the
 * member's current level and an inline control). Changing a member's access
 * (Can use → No access) set-replaces the roster via PUT
 * `/v1/agents/:slug/assignments`, and a full reload proves it round-tripped to
 * the host, not just the client cache.
 *
 * The Teams-shaped state single-player can't reach is armed via the fake host's
 * `/__test__/capabilities` (multiplayer + Teams + a `role`) and `/__test__/org`
 * (a multi-member roster `GET /v1/org` serves + the agent fleet with per-agent
 * assignments `GET /agents` serves). See `@houston/fake-host` README +
 * `knowledge-base/ui-testing.md`.
 */

/** Teams owner: multiplayer + Teams, top role. */
const OWNER_CAPS = { multiplayer: true, teams: true, role: "owner" };

const ROSTER = [
  { userId: "u-self", email: "you@acme.test", role: "owner" },
  { userId: "u-bob", email: "bob@acme.test", role: "user" },
  { userId: "u-cara", email: "cara@acme.test", role: "admin" },
];

/** One everyone-agent + one explicit agent Bob can use (owner also manages it). */
const AGENTS = [
  { id: "agent-marketing", name: "Marketing Assistant", everyone: true },
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

/** Open Admin > People and drill into Bob's per-member access lens. */
async function openBob(page: Page): Promise<void> {
  await page.goto("/");
  await page.locator('[data-tour-target="nav-organization"]').click();
  // The admin index row button's accessible name leads with its title; anchor on
  // it so "People" doesn't collide with other rows' copy.
  await page.getByRole("button", { name: /^People\b/ }).click();
  await page
    .getByRole("button", { name: "Open bob@acme.test's agents" })
    .click();
}

test("owner opens a member, sees their agents, and changing access persists", async ({
  page,
  request,
}) => {
  await armCapabilities(request, OWNER_CAPS);
  await armOrg(request);
  await openBob(page);

  // The lens splits the fleet: an everyone section + an explicit-roster section.
  // Scope to the everyone section (the agent name also shows in the sidebar).
  const everyoneSection = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Shared with everyone" }),
  });
  await expect(everyoneSection.getByText("Marketing Assistant")).toBeVisible();
  // The everyone-agent is read-only with the team note, never an editable control.
  await expect(everyoneSection.getByText("Everyone in the team")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Change access to Marketing Assistant" }),
  ).toHaveCount(0);

  // The explicit agent shows Bob's current level (Can use) on its inline control.
  const finance = page.getByRole("button", {
    name: "Change access to Finance Bot",
  });
  await expect(finance).toContainText("Can use");

  // Owner changes Bob's access to No access → PUT set-replaces the roster.
  await finance.click();
  await page.getByRole("menuitem", { name: /No access/ }).click();
  await expect(finance).toContainText("No access");

  // GET round-trip: a full reload re-reads /agents from the host, and Bob's
  // access is still No access — the write reached the gateway, not just the cache.
  await openBob(page);
  await expect(
    page.getByRole("button", { name: "Change access to Finance Bot" }),
  ).toContainText("No access");
});
