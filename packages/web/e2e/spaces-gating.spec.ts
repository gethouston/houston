import { FAKE_HOST_URL } from "@houston/fake-host";
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import {
  openSettings,
  openSettingsSection,
  settingsRow,
} from "./support/settings-nav";

/**
 * C8 Spaces gating (HOU-824 / HOU-878): when the host advertises
 * `capabilities.spaces`, the Admin (Organization) and Permissions surfaces are
 * TEAM-SPACE surfaces — hidden whenever the active space is personal, whatever
 * the role — because a personal space has single-player semantics (non-invitable,
 * no roster, no policy). The gate is `canSeeOrganization(caps, activeSpaceIsTeam)`
 * (`app/src/components/organization/org-view-model.ts`), where the active space is
 * a team iff its workspace id is `org:<16-hex>` (`app/src/lib/space-id.ts`).
 *
 * Since HOU-788 both live inside Settings, so the gate is observed on the
 * Settings index rows rather than on sidebar nav items.
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

const permissionsRow = (page: Page) => settingsRow(page, "permissions");
const adminRow = (page: Page) => settingsRow(page, "organization");

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

test("spaces host, personal space: the Admin and Permissions rows are hidden", async ({
  page,
  request,
}) => {
  await armCapabilities(request, SPACES_OWNER_CAPS);
  await page.goto("/");
  // `openSettings` waits for the index heading, so the absences below cannot
  // pass on an unpainted screen.
  await openSettings(page);

  // The active space is personal, so both team-space surfaces are gone even for
  // an owner on a full Spaces host.
  await expect(adminRow(page)).toHaveCount(0);
  await expect(permissionsRow(page)).toHaveCount(0);
});

test("regression: a non-spaces Teams host still shows Admin on the personal workspace", async ({
  page,
  request,
}) => {
  await armCapabilities(request, TEAMS_OWNER_CAPS);
  await page.goto("/");
  await openSettings(page);

  // No `caps.spaces`, so the personal/team split doesn't apply: the gate falls
  // through to the members-roster rule and the owner keeps Admin + Permissions —
  // legacy Teams v2 behavior preserved.
  await expect(adminRow(page)).toBeVisible();
  await expect(permissionsRow(page)).toBeVisible();
});

test("spaces host: switching to a team space reveals Admin and Permissions", async ({
  page,
  request,
}) => {
  await armCapabilities(request, SPACES_OWNER_CAPS);
  await armTeamWorkspace(request);
  await page.goto("/");
  await openSettings(page);

  // Personal on boot: both surfaces hidden.
  await expect(adminRow(page)).toHaveCount(0);

  // Switch into the team space through the real switcher UI, then walk back
  // into Settings. Re-opening (rather than asserting in place) is deliberate: a
  // space switch lands the user on their agent home, so the gate — not where
  // the switch happens to leave the view — is what this asserts.
  await switchToSpace(page, TEAM.name);
  await openSettings(page);

  // The active space is now a team → Admin + Permissions appear.
  await expect(adminRow(page)).toBeVisible();
  await expect(permissionsRow(page)).toBeVisible();
});

test("team space: inviting a fresh email through Admin > People renders a pending invite", async ({
  page,
  request,
}) => {
  await armCapabilities(request, SPACES_OWNER_CAPS);
  await armTeamWorkspace(request);
  await page.goto("/");
  await switchToSpace(page, TEAM.name);

  // Open Settings > Admin (the Organization dashboard). It lands on its own
  // INDEX (grouped cards), so drill into the People row to reach the roster.
  await openSettingsSection(page, "organization");
  await page.getByText("People", { exact: true }).first().click();

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

test("switching back to the personal space hides Admin and Permissions again", async ({
  page,
  request,
}) => {
  await armCapabilities(request, SPACES_OWNER_CAPS);
  await armTeamWorkspace(request);
  await page.goto("/");

  await switchToSpace(page, TEAM.name);
  await openSettings(page);
  await expect(adminRow(page)).toBeVisible();

  // Back to personal — the switcher shows the adapter's synthetic personal row,
  // which is always named "Personal" (the seed workspace id never surfaces).
  await switchToSpace(page, "Personal");
  await openSettings(page);
  await expect(adminRow(page)).toHaveCount(0);
  await expect(permissionsRow(page)).toHaveCount(0);
});
