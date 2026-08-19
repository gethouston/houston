import { FAKE_HOST_URL } from "@houston/fake-host";
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { adminRow } from "./support/settings-nav";
import { openAgentSettings } from "./support/team-nav";

/**
 * The AI-models permissioning information architecture — the model-side twin of
 * `integrations-ia.spec.ts`. Each concept has one home:
 *  - POLICY (the allowed-models ceiling) is PER AGENT only → the agent settings
 *    page's AI models section, reached through the team that owns the agent
 *    ("focused agent screen", the one door). The old workspace-wide
 *    "Defaults for every agent" model ceiling was removed as overengineering.
 *    The AI Models hub has provider and model-directory header lozenges.
 *  - ACCOUNTS (HOU-976) are per PERSON and only per person: a team space has no
 *    shared AI account at all — every agent runs on the AI account of whoever
 *    messages it — so the hub is visible to EVERYONE and shows each viewer their
 *    own accounts, with no role-gated section inside it. The space-wide spend
 *    roll-up did NOT open up with it: it lives in the Admin screen, behind the
 *    unchanged owner/admin gate.
 *  - Each member's own model pick lives in the composer, not the hub.
 *  - USAGE (how much of each connected AI account is left) belongs to the
 *    account, so it renders on the hub's Connected row. There is no separate
 *    usage screen anywhere (HOU-789).
 *
 * The Teams-shaped state single-player can't reach is armed via the fake host's
 * `/__test__/capabilities` (advertise `multiplayer` + `teams` + a `role`),
 * `/__test__/workspaces` (the C8 team-space row the hub's account note keys
 * off) and `/__test__/agent-settings` (the agent model ceiling); the `/v1/org`
 * view load is served by the fake host. See `@houston/fake-host` README +
 * `packages/web/e2e/README.md`.
 */

/** Teams owner: multiplayer + Teams, top role. */
const OWNER_CAPS = {
  multiplayer: true,
  teams: true,
  role: "owner",
};

/** Teams + Spaces, so the switcher can reach an armed TEAM space. The hub's
 *  The old "Your accounts" note is gone everywhere (removed Aug 2026). */
const SPACES_CAPS = { multiplayer: true, teams: true, spaces: true };

/** The armed team space (id `org:<16-hex>`), reachable through the switcher. */
const TEAM = { slug: "00000000000000ab", name: "Acme Team" };

async function armCapabilities(
  request: APIRequestContext,
  caps: Record<string, unknown>,
): Promise<void> {
  await request.post(`${FAKE_HOST_URL}/__test__/capabilities`, { data: caps });
}

/** Arm the team-space row the C8 workspaces bridge serves. */
async function armTeamWorkspace(request: APIRequestContext): Promise<void> {
  await request.post(`${FAKE_HOST_URL}/__test__/workspaces`, {
    data: { teams: [TEAM] },
  });
}

/** A stable nav anchor that is ALWAYS present, so absence assertions never race
 *  an unrendered sidebar. */
const settlesShell = (page: Page) =>
  expect(page.locator('[data-tour-target="nav-settings"]')).toBeVisible();

/** Switch space through the REAL switcher UI the shell renders. */
async function switchToTeam(page: Page): Promise<void> {
  await page
    .locator('[data-tour-target="spaceSwitcher"] button')
    .first()
    .click();
  await page.getByRole("menuitem", { name: TEAM.name }).click();
}

/** Open the AI Models hub from the sidebar. */
async function openHub(page: Page): Promise<void> {
  await page.locator('[data-tour-target="nav-ai-hub"]').click();
}

// ── 1. The AI hub has provider and model-directory surfaces ────────────────

test("Teams owner: the AI hub has AI Providers and AI Models lozenges", async ({
  page,
  request,
}) => {
  // Model policy is per agent, never a hub mode. Direct model discovery is the
  // second header lozenge and shares the page query with provider discovery.
  await armCapabilities(request, OWNER_CAPS);
  await page.goto("/");
  await page.locator('[data-tour-target="nav-ai-hub"]').click();

  // Scoped to the header nav: the sidebar row shares the "AI Models" name.
  const headerNav = page.getByRole("navigation", {
    name: "AI providers and models",
  });
  await expect(
    headerNav.getByRole("button", { name: "AI Providers", exact: true }),
  ).toBeVisible();
  const allModels = headerNav.getByRole("button", {
    name: "AI Models",
    exact: true,
  });
  await expect(allModels).toBeVisible();
  await expect(page.getByRole("heading", { name: "Available" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Connect / }).first(),
  ).toBeVisible();
  const search = page.getByPlaceholder("Search AI models and providers");
  await search.fill("claude");
  await allModels.click();
  await expect(search).toHaveValue("claude");
  await expect(page.getByRole("heading", { name: "Connected" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Good at" })).toBeVisible();
});

// ── 2. Plain member: the hub is theirs, but only their own accounts ─────────

test("Teams member: the AI Models nav is there, and no usage screen is", async ({
  page,
  request,
}) => {
  // HOU-976 reversed the old rule. A member has their OWN AI account to connect,
  // and the hub is the only surface that can manage it, so it is never hidden.
  // No usage nav rides in with it: account usage belongs to the account (it
  // renders on the hub's Connected row, HOU-789) and the space-wide roll-up
  // stays in the Admin screen, one level down.
  await armCapabilities(request, { ...SPACES_CAPS, role: "user" });
  await armTeamWorkspace(request);
  await page.goto("/");
  await settlesShell(page);

  await expect(page.locator('[data-tour-target="nav-ai-hub"]')).toBeVisible();
  await expect(page.locator('[data-tour-target="nav-usage"]')).toHaveCount(0);
  await expect(page.locator('[data-tour-target="nav-inbox"]')).toBeVisible();
});

test("Teams member in a team space: the hub is theirs, and says so", async ({
  page,
  request,
}) => {
  // A member with nothing connected must land on a surface that tells them the
  // accounts here are their own and lets them connect one — no Team account
  // section to mistake for theirs, and nobody to go ask. This is the whole
  // self-serve promise of personal-only (HOU-976).
  await armCapabilities(request, { ...SPACES_CAPS, role: "user" });
  await armTeamWorkspace(request);
  await page.goto("/");
  await settlesShell(page);
  await switchToTeam(page);
  await openHub(page);

  // The old "Your accounts" note is gone; the surface itself is the answer:
  // connect is right there, on every provider this member has not connected
  // yet. No approval step, nobody to go ask.
  await expect(page.getByText("Your accounts")).toHaveCount(0);
  await expect(page.getByText("Team account", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Connect OpenAI" }),
  ).toBeVisible();
});

test("Teams owner in a team space: the same one surface, no account choice", async ({
  page,
  request,
}) => {
  // An owner has no extra AI-credential authority in a team space any more:
  // there is no shared account to manage, so they see exactly what a member
  // sees. A choice control here would be offering an account that cannot exist.
  await armCapabilities(request, { ...SPACES_CAPS, role: "owner" });
  await armTeamWorkspace(request);
  await page.goto("/");
  await settlesShell(page);
  await switchToTeam(page);
  await openHub(page);

  await expect(page.getByText("Your accounts")).toHaveCount(0);
  await expect(page.getByRole("radio", { name: "Team account" })).toHaveCount(
    0,
  );
  await expect(page.getByText("Team account", { exact: true })).toHaveCount(0);
});

test("personal space: the hub renders NO account note at all", async ({
  page,
  request,
}) => {
  // The migration guarantee, asserted. One account means nothing to
  // disambiguate, so the hub must look exactly like the pre-HOU-976 surface:
  // no heading, no extra chrome.
  await armCapabilities(request, { ...SPACES_CAPS, role: "owner" });
  await armTeamWorkspace(request);
  await page.goto("/");
  await settlesShell(page);
  await openHub(page);

  await expect(page.getByText("Your accounts")).toHaveCount(0);
  await expect(page.getByText("Team account", { exact: true })).toHaveCount(0);
  // The hub itself is fully there, so the absence above is the frame, not a
  // failed render.
  await expect(page.getByRole("heading", { name: "Available" })).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "AI providers and models" })
      .getByRole("button", { name: "AI Models", exact: true }),
  ).toBeVisible();
});

// ── 3. Per-agent model ceiling editor ──────────────────────────────────────

test("a per-agent model ceiling offers the full catalog (no org narrowing)", async ({
  page,
  request,
}) => {
  // Policy is per agent only: a manager narrowing the agent's model ceiling picks
  // from the WHOLE catalog — there is no workspace-wide ceiling to narrow it, so
  // every model (Opus AND Sonnet) is offerable. The ceiling lives on the agent
  // settings page's AI models section, reached through its team's "Manage
  // agents" row — the one door onto agent policy.
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
  await page.goto("/");
  await openAgentSettings(page, "Finance Bot", "AI Models");

  // The per-agent card shows the model ceiling hero, starting unrestricted.
  await expect(
    page.getByRole("heading", { name: "Allowed AI Models" }),
  ).toBeVisible();
  await expect(
    page.getByText("Which AI models can this agent use?"),
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

  // And no usage screen competes with it anywhere. The rail's "Workspace" band
  // carries Admin and nothing usage-shaped at all: Time worked is a LENS inside
  // Admin > Time worked, never a destination of its own, and it rides
  // `capabilities.computeUsage`, which the fake host does not advertise here.
  // The owner/admin spend roll-up lives INSIDE Admin, one level down.
  await expect(adminRow(page)).toBeVisible();
  await expect(
    page
      .locator("[data-tour-target='sidebar']")
      .getByRole("button", { name: "Time worked", exact: true }),
  ).toHaveCount(0);
});

// ── 5. A member connects, and their own turns are configured (HOU-976) ─────

test("a team-space member's connect configures THEIR turns, with no scope on the wire", async ({
  page,
  request,
}) => {
  // The end-to-end promise of personal-only. Two halves:
  //
  //  1. the hub a member opens is already showing THEIR resolution — the
  //     Connected strip lists the providers that answer their own messages, and
  //     the catalog offers a connect for the ones that do not yet;
  //  2. that connect names no account on the wire. WHOSE credential it writes is
  //     the gateway's call, derived from the space the request lands in. A
  //     `?scope=` creeping back in would re-introduce a client-side resolution
  //     the server now owns, and it is the one regression that would be
  //     invisible in the UI.
  await armCapabilities(request, { ...SPACES_CAPS, role: "user" });
  await armTeamWorkspace(request);

  const credentialCalls: string[] = [];
  await page.route("**/*", async (route) => {
    const url = route.request().url();
    if (/\/credential\/|\/auth\//.test(url)) credentialCalls.push(url);
    await route.continue();
  });

  await page.goto("/");
  await settlesShell(page);
  await switchToTeam(page);
  await openHub(page);

  // What already answers for THIS member. The strip is per-viewer by
  // construction: it renders the provider status probe, which the pod resolves
  // against the acting identity's own credential file.
  await expect(page.getByRole("heading", { name: /^Connected/ })).toBeVisible();

  // And the self-serve connect for one that does not.
  await page.getByRole("button", { name: "Connect OpenAI" }).click();

  // The login round-trip fired…
  await expect
    .poll(() => credentialCalls.length, { timeout: 15_000 })
    .toBeGreaterThan(0);
  // …and not one request named an account.
  for (const url of credentialCalls) {
    expect(url).not.toContain("scope=");
  }
});
