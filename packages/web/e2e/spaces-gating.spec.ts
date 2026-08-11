import { FAKE_HOST_URL } from "@houston/fake-host";
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { adminRow, openAdminSection } from "./support/settings-nav";
import { navRow } from "./support/team-nav";

/**
 * C8 Spaces gating (HOU-824 / HOU-878): when the host advertises
 * `capabilities.spaces`, Admin exists in personal and team spaces. Personal
 * People offers the shared create-organization face because the space itself
 * is non-invitable. The gate is `canSeeOrganization(caps, activeSpaceIsTeam)`
 * (`app/src/components/organization/org-view-model.ts`), where the active space is
 * a team iff its workspace id is `org:<16-hex>` (`app/src/lib/space-id.ts`).
 *
 * Admin is a TOP-LEVEL screen in the rail's "Workspace" band, so the gate is
 * observed on its rail row. It used to have a twin — the Permissions screen,
 * which shared this gate exactly — but that screen is gone: agent policy is
 * discovered through a team's focused agent screen, whose own gate is per
 * team (`agent-policy.spec.ts`), not per space.
 *
 * On a NON-spaces multiplayer host (legacy Teams v2, exactly one org) there is no
 * personal/team split, so the gate falls through to the members-roster rule and
 * Admin stays visible on the sole workspace — the regression guard below.
 *
 * The spaces-shaped state single-player can't reach is armed via the fake host's
 * `/__test__/capabilities` (`{ spaces:true }`) and `/__test__/workspaces` (team
 * rows the C8 workspaces bridge serves at `GET /v1/workspaces`). See
 * `@houston/fake-host` README + `knowledge-base/ui-testing.md`.
 *
 * The team-space cases drive the REAL switcher UI against the fake host's
 * armed team rows — live since the adapter's `listWorkspaces` bridges the C8
 * workspaces surface (HOU-881).
 */

/** A Spaces owner: multiplayer + Teams + Spaces, top role. */
const SPACES_OWNER_CAPS = {
  multiplayer: true,
  teams: true,
  spaces: true,
  role: "owner",
};

/** Legacy Teams v2 owner: multiplayer + Teams, NO spaces (one org, no split). */
const TEAMS_OWNER_CAPS = { multiplayer: true, teams: true, role: "owner" };

/** An armed team space (id `org:<16-hex>`), reachable through the switcher. */
const TEAM = { slug: "00000000000000ab", name: "Acme Team" };

async function armCapabilities(
  request: APIRequestContext,
  caps: Record<string, unknown>,
): Promise<void> {
  await request.post(`${FAKE_HOST_URL}/__test__/capabilities`, { data: caps });
}

/** Arm the team-space rows the C8 workspaces bridge serves. */
async function armTeamWorkspace(request: APIRequestContext): Promise<void> {
  await request.post(`${FAKE_HOST_URL}/__test__/workspaces`, {
    data: { teams: [TEAM] },
  });
}

/** A rail row that is ALWAYS present, whatever the gates say: the anchor that
 *  keeps an absence assertion from passing on an unpainted rail. */
const railPainted = (page: Page) =>
  expect(navRow(page, "settings")).toBeVisible();

/**
 * Open the workspace switcher and switch to the named space through the REAL
 * switcher UI (the same DropdownMenu the shell renders), then wait for the
 * switcher itself to name the new space — the switch drops the query cache and
 * re-establishes the event stream, so the assertions must not start until it has
 * settled.
 */
async function switchToSpace(page: Page, name: string): Promise<void> {
  const switcher = page.locator('[data-tour-target="spaceSwitcher"]');
  await switcher.locator("button").first().click();
  await page.getByRole("menuitem", { name }).click();
  await expect(switcher.getByText(name, { exact: true })).toBeVisible();
}

test("spaces host, personal space: Admin shows the create-organization People face", async ({
  page,
  request,
}) => {
  await armCapabilities(request, SPACES_OWNER_CAPS);
  await page.goto("/");
  await railPainted(page);

  await expect(adminRow(page)).toBeVisible();
  await openAdminSection(page, "People");
  await expect(
    page.getByText("To invite other people, create an organization."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Create organization" }).click();
  await expect(
    page.getByRole("heading", { name: "Create a team" }),
  ).toBeVisible();
});

test("regression: a non-spaces Teams host still shows Admin on the personal workspace", async ({
  page,
  request,
}) => {
  await armCapabilities(request, TEAMS_OWNER_CAPS);
  await page.goto("/");

  // No `caps.spaces`, so the personal/team split doesn't apply: the gate falls
  // through to the members-roster rule and the owner keeps Admin — legacy Teams
  // v2 behavior preserved.
  await expect(adminRow(page)).toBeVisible();
});

test("spaces host: switching to a team space reveals Admin", async ({
  page,
  request,
}) => {
  await armCapabilities(request, SPACES_OWNER_CAPS);
  await armTeamWorkspace(request);
  await page.goto("/");
  await railPainted(page);

  // Personal on boot: the surface is hidden.
  await expect(adminRow(page)).toHaveCount(0);

  // Switch into the team space through the real switcher UI. The rail rebuilds
  // in place — a space switch lands the user on their agent home, and the gate,
  // not where the switch leaves the view, is what this asserts.
  await switchToSpace(page, TEAM.name);

  // The active space is now a team → Admin appears.
  await expect(adminRow(page)).toBeVisible();
});

test("team space: inviting a fresh email through Admin > People renders a pending invite", async ({
  page,
  request,
}) => {
  await armCapabilities(request, SPACES_OWNER_CAPS);
  await armTeamWorkspace(request);
  await page.goto("/");
  await switchToSpace(page, TEAM.name);

  // Open Admin (the Organization dashboard) from the rail on its People
  // section — a lozenge in the header cluster — to reach the roster.
  await openAdminSection(page, "People");

  // Invite a fresh email → the fake host mints a pending invite (202
  // `{invited:true}`) and `GET /v1/org` surfaces it in `invites`.
  const email = "newbie@acme.test";
  await page.locator("#org-add-email").fill(email);
  await page.getByRole("button", { name: "Add", exact: true }).click();

  // The pending-invite row renders under the "Pending invitations" heading —
  // the invited address itself is the real signal (the heading also matches
  // the "No pending invitations." empty state).
  await expect(
    page.getByRole("heading", { name: "Pending invitations" }),
  ).toBeVisible();
  // Exact: the "Invitation sent to <email>…" confirmation also contains the
  // address; the exact-text node is the pending-invite ROW.
  await expect(page.getByText(email, { exact: true })).toBeVisible();
});

/**
 * The rail's Skills row is the same question asked of a different surface:
 * skills are what every agent in the space can do, so editing them edits
 * everyone's agents at once and that belongs to whoever OWNS the space
 * (`isSpaceOwner`). A personal space has single-player semantics, so its one
 * human owns it whatever their org role reads.
 */
test("Skills belongs to the space owner: a Manager loses it in a team space", async ({
  page,
  request,
}) => {
  await armCapabilities(request, { ...SPACES_OWNER_CAPS, role: "admin" });
  await armTeamWorkspace(request);
  await page.goto("/");

  // Personal space first: single-player semantics, so the row is theirs.
  await expect(navRow(page, "skills")).toBeVisible();

  await switchToSpace(page, TEAM.name);

  // In the team space an admin runs the place but does not own it, so the row
  // goes. Settings stays — it is everyone's — which is what makes the absence
  // a gate rather than an unpainted band.
  await expect(navRow(page, "skills")).toHaveCount(0);
  await expect(navRow(page, "settings")).toBeVisible();

  // And it really is about OWNERSHIP, not about being junior: the same caller
  // keeps the owner/admin row in the same band.
  await expect(adminRow(page)).toBeVisible();
});

test("the space owner keeps Skills in their team space", async ({
  page,
  request,
}) => {
  await armCapabilities(request, SPACES_OWNER_CAPS);
  await armTeamWorkspace(request);
  await page.goto("/");
  await expect(navRow(page, "skills")).toBeVisible();

  await switchToSpace(page, TEAM.name);
  await expect(navRow(page, "skills")).toBeVisible();
});

test("switching back to the personal space keeps Admin visible", async ({
  page,
  request,
}) => {
  await armCapabilities(request, SPACES_OWNER_CAPS);
  await armTeamWorkspace(request);
  await page.goto("/");

  await switchToSpace(page, TEAM.name);
  await expect(adminRow(page)).toBeVisible();

  // Back to personal — the switcher shows the adapter's synthetic personal row,
  // which is always named "Personal" (the seed workspace id never surfaces).
  await switchToSpace(page, "Personal");
  await expect(adminRow(page)).toBeVisible();
});
