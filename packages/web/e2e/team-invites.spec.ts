import { FAKE_HOST_URL } from "@houston/fake-host";
import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { workspaceMenuTrigger } from "./support/workspace-menu";

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

const inbox = (page: Page): Locator =>
  page.locator('[aria-label="Invitations"]');

const inviteCards = (page: Page): Locator => inbox(page).getByRole("listitem");

async function expectUnderTheTopLine(page: Page): Promise<void> {
  const topLine = await page
    .locator("[data-tour-target='sidebar']")
    .getByTestId("rail-search")
    .boundingBox();
  const section = await inbox(page).boundingBox();
  const card = await inviteCards(page).first().boundingBox();
  const firstNavItem = await page
    .locator("[data-tour-target='agents'] button")
    .first()
    .boundingBox();
  if (!topLine || !section || !card || !firstNavItem)
    throw new Error("sidebar top line, inbox or list is not laid out");
  expect(section.y).toBeGreaterThanOrEqual(topLine.y + topLine.height);
  expect(section.y + section.height).toBeLessThanOrEqual(firstNavItem.y);
  expect(Math.abs(card.x - firstNavItem.x)).toBeLessThanOrEqual(1);
  expect(
    Math.abs(card.x + card.width - (firstNavItem.x + firstNavItem.width)),
  ).toBeLessThanOrEqual(1);
}

async function openSwitcher(page: Page): Promise<void> {
  await workspaceMenuTrigger(page).click();
}

test("a pending invite renders as a card under the rail's top line", async ({
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
  await expectUnderTheTopLine(page);
  await expect(inviteCards(page).first()).toContainText(
    `You were invited to join ${ACME}`,
  );
  await expect(inviteCards(page).first()).toContainText(
    "You will join as Member.",
  );
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

  await openSwitcher(page);
  await expect(page.getByRole("menuitemcheckbox", { name: ACME })).toHaveCount(
    0,
  );
  await page.keyboard.press("Escape");

  await page
    .getByRole("button", { name: `Accept the invitation to ${ACME}` })
    .click();

  await expect(inboxOrNothing(page)).toHaveCount(0);
  await expect(page.getByText(`You joined ${ACME}`)).toBeVisible();
  await expect(
    page.getByText("Switch to it any time from the space menu"),
  ).toBeVisible();

  await openSwitcher(page);
  await expect(
    page.getByRole("menuitemcheckbox", { name: ACME }),
  ).toBeVisible();
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

  await expect(inviteCards(page)).toHaveCount(1);
  await expect(inviteCards(page).first()).toContainText("Bravo Labs");
  await openSwitcher(page);
  await expect(page.getByRole("menuitemcheckbox", { name: ACME })).toHaveCount(
    0,
  );
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

  const message = page.getByText("This organization is locked");
  await expect(message).toBeVisible();
  await expect(
    page.getByTestId("toast-container").getByRole("alert"),
  ).toHaveCount(0);
  await expect(message.locator("xpath=../..")).not.toHaveClass(/border-danger/);

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
  await expect(
    page.getByTestId("toast-container").getByRole("alert"),
  ).toHaveCount(0);
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

  const railButton = page.getByRole("button", {
    name: "2 pending invitations",
  });
  await expect(railButton).toBeVisible();
  await expect(inviteCards(page)).toHaveCount(0);

  await railButton.click();
  await expect(inviteCards(page)).toHaveCount(2);
});

test("no Spaces capability: the invite inbox renders nothing at all", async ({
  page,
  request,
}) => {
  await armInvites(request, [{ orgName: ACME, role: "user" }]);
  await page.goto("/");

  await expect(workspaceMenuTrigger(page)).toBeVisible();
  await expect(inboxOrNothing(page)).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /pending invitation/ }),
  ).toHaveCount(0);
});

function inboxOrNothing(page: Page): Locator {
  return page.locator('[aria-label="Invitations"]');
}
