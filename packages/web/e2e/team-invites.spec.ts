import { FAKE_HOST_URL } from "@houston/fake-host";
import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { navRow } from "./support/team-nav";

/**
 * C8 team invites, the INVITEE side: the invite inbox that rides the sidebar's
 * `headerBelow` band, directly under the workspace switcher
 * (`app/src/components/shell/pending-invites.tsx`, mounted by
 * `SidebarInviteInbox`).
 *
 * The gateway auto-joins pending invites only on an account's FIRST-EVER
 * contact, so for every existing user this surface is the only way in — which
 * makes "does the card render, and does answering it actually move the team"
 * the whole feature. The fake host serves the real C8 wire
 * (`GET /v1/orgs` → `{orgs, invites}`, `POST /v1/org-invites/:id/accept` → 201
 * `{org}`, `DELETE /v1/org-invites/:id` → 204) from `@houston/fake-host`
 * `routes-spaces.ts`; `/__test__/space-invites` arms the inbox and can force
 * any of the three expected rejections per invite.
 *
 * Accepting is asserted through the REAL switcher dropdown rather than a
 * network spy: the point of joining is that the team is somewhere you can go.
 */

/** A Spaces host: the capability the whole surface is gated on, both sides. */
const SPACES_CAPS = {
  multiplayer: true,
  teams: true,
  spaces: true,
  role: "owner",
};

const ACME = "Acme Team";

async function armCapabilities(
  request: APIRequestContext,
  caps: Record<string, unknown>,
): Promise<void> {
  await request.post(`${FAKE_HOST_URL}/__test__/capabilities`, { data: caps });
}

async function armInvites(
  request: APIRequestContext,
  invites: Record<string, unknown>[],
): Promise<void> {
  await request.post(`${FAKE_HOST_URL}/__test__/space-invites`, {
    data: { invites },
  });
}

/** The invite inbox: the sidebar's `headerBelow` band. */
const inbox = (page: Page): Locator =>
  page.locator('[aria-label="Invitations"]');

const inviteCards = (page: Page): Locator => inbox(page).getByRole("listitem");

/**
 * Assert the inbox really sits between the switcher and the nav — geometry, not
 * DOM order, because the placement IS the design argument: an invitation
 * belongs where the user picks a space, always visible, not inside the
 * switcher's dropdown and not somewhere further down the rail.
 */
async function expectUnderTheSwitcher(page: Page): Promise<void> {
  const switcher = await page
    .locator('[data-tour-target="spaceSwitcher"]')
    .boundingBox();
  const section = await inbox(page).boundingBox();
  const card = await inviteCards(page).first().boundingBox();
  // The Inbox row leads the rail's top-level destinations.
  const firstNavItem = await navRow(page, "inbox").boundingBox();
  if (!switcher || !section || !card || !firstNavItem)
    throw new Error("sidebar header, inbox or nav is not laid out");
  expect(section.y).toBeGreaterThanOrEqual(switcher.y + switcher.height);
  expect(section.y + section.height).toBeLessThanOrEqual(firstNavItem.y);
  // Full rail width: a card lines up with the rows below it rather than being
  // inset by the collapse toggle's column (the sidebar's `headerBelow` band,
  // not the header's own row).
  expect(Math.abs(card.x - firstNavItem.x)).toBeLessThanOrEqual(1);
  expect(
    Math.abs(card.x + card.width - (firstNavItem.x + firstNavItem.width)),
  ).toBeLessThanOrEqual(1);
}

/** Open the switcher dropdown and read back the spaces it offers. */
async function openSwitcher(page: Page): Promise<void> {
  await page
    .locator('[data-tour-target="spaceSwitcher"]')
    .locator("button")
    .first()
    .click();
}

test("a pending invite renders as a card under the workspace switcher", async ({
  page,
  request,
}) => {
  await armCapabilities(request, SPACES_CAPS);
  await armInvites(request, [
    { orgName: ACME, role: "user" },
    { orgName: "Bravo Labs", role: "admin", invitedBy: "ada@acme.test" },
  ]);
  await page.goto("/");

  await expect(inviteCards(page)).toHaveCount(2);
  await expectUnderTheSwitcher(page);
  // Sorted by team name (`sortInvites`), so the order is stable across polls
  // and an Accept button never slides under the cursor.
  await expect(inviteCards(page).first()).toContainText(
    `You were invited to join ${ACME}`,
  );
  await expect(inviteCards(page).first()).toContainText(
    "You will join as Member.",
  );
  // An inviter is named only when the gateway sent something human; an email
  // qualifies, a bare user id does not (`inviterDisplayName`).
  await expect(inviteCards(page).nth(1)).toContainText(
    "ada@acme.test invited you to Bravo Labs",
  );
  await expect(inviteCards(page).nth(1)).toContainText(
    "You will join as Manager.",
  );
});

test("accepting an invite joins the team: the card goes, the space arrives", async ({
  page,
  request,
}) => {
  await armCapabilities(request, SPACES_CAPS);
  await armInvites(request, [{ orgName: ACME, role: "user" }]);
  await page.goto("/");
  await expect(inviteCards(page)).toHaveCount(1);

  // The switcher offers only the personal space before the join.
  await openSwitcher(page);
  await expect(page.getByRole("menuitem", { name: ACME })).toHaveCount(0);
  await page.keyboard.press("Escape");

  await page
    .getByRole("button", { name: `Accept the invitation to ${ACME}` })
    .click();

  // The answered card leaves as soon as the refreshed list drops the invite.
  await expect(inboxOrNothing(page)).toHaveCount(0);
  // The success toast only promises the space menu once `teamIsInSwitcher`
  // confirmed the reloaded workspace list really holds the team.
  await expect(page.getByText(`You joined ${ACME}`)).toBeVisible();
  await expect(
    page.getByText("Switch to it any time from the space menu"),
  ).toBeVisible();

  // ...and it really is there. Nothing switched the active space: joining is
  // not going there.
  await openSwitcher(page);
  await expect(page.getByRole("menuitem", { name: ACME })).toBeVisible();
});

test("declining an invite removes the card", async ({ page, request }) => {
  await armCapabilities(request, SPACES_CAPS);
  await armInvites(request, [
    { orgName: ACME, role: "user" },
    { orgName: "Bravo Labs", role: "user" },
  ]);
  await page.goto("/");
  await expect(inviteCards(page)).toHaveCount(2);

  await page
    .getByRole("button", { name: `Decline the invitation to ${ACME}` })
    .click();

  // Only the declined one goes; a decline never touches the other invitations.
  await expect(inviteCards(page)).toHaveCount(1);
  await expect(inviteCards(page).first()).toContainText("Bravo Labs");
  // A decline joins nothing, so no space appears.
  await openSwitcher(page);
  await expect(page.getByRole("menuitem", { name: ACME })).toHaveCount(0);
});

test("a needs_upgrade rejection explains itself in a plain toast, keeping the invite", async ({
  page,
  request,
}) => {
  await armCapabilities(request, SPACES_CAPS);
  await armInvites(request, [
    { orgName: ACME, role: "user", reject: "needs_upgrade" },
  ]);
  await page.goto("/");

  await page
    .getByRole("button", { name: `Accept the invitation to ${ACME}` })
    .click();

  const message = page.getByText("This team needs an upgrade");
  await expect(message).toBeVisible();
  // Informational, NOT the red bug toast: nothing is broken, so the branded
  // "we have a problem" pair (and its auto-report) must not fire.
  await expect(page.getByText("Houston, we have a problem!")).toHaveCount(0);
  // The toast row itself carries no danger border (`variant:"info"`).
  await expect(message.locator("xpath=../..")).not.toHaveClass(/border-danger/);

  // The invite STAYS: an upgrade makes it acceptable again.
  await expect(inviteCards(page)).toHaveCount(1);
});

test("an invite revoked behind the user's back disappears on the failed accept", async ({
  page,
  request,
}) => {
  await armCapabilities(request, SPACES_CAPS);
  await armInvites(request, [
    { orgName: ACME, role: "user", reject: "invite_not_found" },
  ]);
  await page.goto("/");

  await page
    .getByRole("button", { name: `Accept the invitation to ${ACME}` })
    .click();

  await expect(
    page.getByText("This invitation is no longer available"),
  ).toBeVisible();
  await expect(page.getByText("Houston, we have a problem!")).toHaveCount(0);
  // Both hooks invalidate the list on the FAILURE path too, so the stale card
  // goes even though nothing was joined.
  await expect(inboxOrNothing(page)).toHaveCount(0);
});

test("the collapsed rail keeps the invitation reachable as a count button", async ({
  page,
  request,
}) => {
  await armCapabilities(request, SPACES_CAPS);
  await armInvites(request, [
    { orgName: ACME, role: "user" },
    { orgName: "Bravo Labs", role: "user" },
  ]);
  await page.goto("/");
  await expect(inviteCards(page)).toHaveCount(2);

  await page.getByRole("button", { name: "Collapse sidebar" }).click();

  // The cards need width the icon rail hasn't got, so the count stands in —
  // still always visible, never behind a hover.
  const railButton = page.getByRole("button", {
    name: "2 pending invitations",
  });
  await expect(railButton).toBeVisible();
  await expect(inviteCards(page)).toHaveCount(0);

  // Pressing it expands the rail back onto the real cards.
  await railButton.click();
  await expect(inviteCards(page)).toHaveCount(2);
});

test("no Spaces capability: the invite inbox renders nothing at all", async ({
  page,
  request,
}) => {
  // Invites armed, but the deployment does not serve Spaces. The RENDER gate
  // (`visibleInvites`) is what has to hold here: gating only the fetch would
  // leave a cached list painting cards over a host whose mutators throw.
  await armInvites(request, [{ orgName: ACME, role: "user" }]);
  await page.goto("/");

  // Anchor on a painted shell first, so the absence below can't pass on an
  // empty screen.
  await expect(
    page.locator('[data-tour-target="spaceSwitcher"]'),
  ).toBeVisible();
  await expect(inboxOrNothing(page)).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /pending invitation/ }),
  ).toHaveCount(0);
});

/** The inbox looked up without the sibling constraint — for absence checks. */
function inboxOrNothing(page: Page): Locator {
  return page.locator('[aria-label="Invitations"]');
}
