import { FAKE_HOST_URL, SEED_AGENT_NAME } from "@houston/fake-host";
import type { Page } from "@playwright/test";
import { openAgentSettingsSection } from "./support/agent-nav";
import { FOLLOW_UP_PLACEHOLDER } from "./support/composer";
import { expect, test } from "./support/fixtures";
import { missionCard, screen } from "./support/nav-common";
import {
  armOrgLock,
  LOCKED,
  orgBilling,
  PAST_DUE,
  setTeamBilling,
  statusBanner,
  TEAM,
} from "./support/org-lock";
import {
  CHECKOUT_URL,
  openedUrls,
  PORTAL_URL,
  planCalls,
  stubOpener,
} from "./support/plan";
import { openAdminSection } from "./support/settings-nav";
import { seedAgentSkills } from "./support/skills-nav";
import { openTeamSection, teamTab } from "./support/team-nav";

/**
 * A locked org (H4): the strip says why and offers the way out the SDK allows
 * the reader (`orgRecovery`), every write is turned off with the same reason,
 * and reading, moving agents out and removing people stay open. Driven
 * against the fake gateway's armed team (`support/org-lock.ts`), which also
 * refuses a locked org's writes with `403 needs_upgrade`.
 */

const OWNER_REASON =
  "Acme is locked. Unlock it to send messages and make changes.";

async function armRoster(): Promise<void> {
  await fetch(`${FAKE_HOST_URL}/__test__/org`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      members: [
        { userId: "u-self", email: "you@acme.test", role: "owner" },
        { userId: "u-bo", email: "bo@acme.test", role: "user" },
      ],
    }),
  });
}

const askOwnerOnly = async (page: Page, sentence: string) => {
  const banner = statusBanner(page);
  await expect(banner).toContainText(sentence);
  await expect(banner.getByRole("button")).toHaveCount(0);
};

test("locked, the owner who pays: the strip, writes off with the reason, reads open", async ({
  page,
}) => {
  await armOrgLock(page, { team: LOCKED });
  await armRoster();
  await page.goto("/");

  const banner = statusBanner(page);
  await expect(banner).toHaveAttribute("data-state", "locked");
  await expect(banner).toContainText(
    "Acme is locked, so nobody can send messages or make changes. You can still read everything and move AI Employees out.",
  );
  await expect(banner.getByRole("button", { name: "Unlock" })).toBeEnabled();
  await expect(
    banner.getByRole("button", { name: "Move to free tier" }),
  ).toBeEnabled();

  // No new AI Employee and no new task in a locked org.
  await expect(page.getByTestId("rail-add-employee")).toHaveCount(0);
  // Kept-alive boards each draw the button: every one is off.
  const newTask = page.getByRole("button", { name: "New task" });
  await expect(newTask.first()).toBeDisabled();
  for (const button of await newTask.all()) await expect(button).toBeDisabled();

  // The conversation reads; its composer is the locked card.
  await missionCard(page, "Plan a trip to Tokyo").click();
  const card = page.getByTestId("org-locked-card");
  await expect(card).toContainText(OWNER_REASON);
  await expect(card.getByRole("button", { name: "Unlock" })).toBeVisible();
  await expect(page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER)).toHaveCount(0);
  await page.keyboard.press("Escape");

  // Files read and download; nothing creates or uploads.
  await openTeamSection(page, "Files");
  await expect(page.getByText("Q3 report.pdf")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Download all" }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "New", exact: true }),
  ).toHaveCount(0);

  // The employee's own settings: renaming is off, with the reason.
  await openTeamSection(page, "Settings");
  await expect(screen(page).getByTestId("org-locked-note")).toHaveText(
    OWNER_REASON,
  );
  await expect(
    page.getByRole("button", { name: "Change color & name" }),
  ).toBeDisabled();

  // People: nobody new comes in, removing someone stays open.
  await openAdminSection(page, "People");
  await expect(screen(page).getByTestId("org-locked-note")).toHaveText(
    OWNER_REASON,
  );
  await expect(page.locator("#org-add-email")).toBeDisabled();
  await expect(page.getByRole("button", { name: /^Remove bo/ })).toBeEnabled();
});

test("locked, the owner who pays: Unlock asks yearly or monthly, then opens that checkout", async ({
  page,
}) => {
  await stubOpener(page, false);
  await armOrgLock(page, { team: LOCKED });
  await page.goto("/");

  await statusBanner(page).getByRole("button", { name: "Unlock" }).click();
  const dialog = page.getByRole("dialog", { name: "Unlock Acme" });
  await expect(dialog).toContainText(
    "You'll pay in your browser, and Acme unlocks once the payment goes through.",
  );
  const choice = dialog.getByRole("radiogroup", { name: "How to pay" });
  await expect(choice.getByRole("radio", { name: /^Yearly/ })).toBeChecked();
  await expect(dialog.getByText("$540 a year for 3 members")).toBeVisible();
  await dialog.getByRole("button", { name: "Continue to payment" }).click();

  await expect(dialog).toBeHidden();
  await expect.poll(() => openedUrls(page)).toEqual([CHECKOUT_URL]);
  const checkouts = (await planCalls()).filter(
    (call) => call.route === "checkout",
  );
  expect(checkouts.map((call) => call.body)).toEqual([
    { orgSlug: TEAM.slug, interval: "year" },
  ]);
});

test("locked: a skill opens and reads, and nothing adds, saves or deletes one", async ({
  page,
  request,
}) => {
  await seedAgentSkills(request);
  await armOrgLock(page, { team: LOCKED });
  await page.goto("/");

  await teamTab(page, "Settings").click();
  await openAgentSettingsSection(page, "Skills");
  await expect(
    screen(page).getByRole("searchbox", { name: "Search skills" }),
  ).toBeVisible();
  await expect(screen(page).getByTestId("org-locked-note")).toHaveText(
    OWNER_REASON,
  );
  await expect(
    screen(page).getByRole("button", { name: "Create skill" }),
  ).toBeDisabled();

  await screen(page)
    .getByRole("button", { name: /^Invoice triage\b/ })
    .click();
  const editor = page.getByTestId("skill-editor");
  await expect(editor.getByTestId("org-locked-note")).toHaveText(OWNER_REASON);
  await editor.getByRole("tab", { name: "Text" }).click();
  const markdown = editor.getByLabel("Instructions for the AI Employee");
  await expect(markdown).toHaveValue(/Invoice triage/);
  await expect(markdown).toHaveAttribute("readonly", "");
  await expect(
    editor.getByRole("button", { name: "Save changes" }),
  ).toBeDisabled();
  await editor.getByRole("button", { name: "More actions" }).click();
  for (const item of await page.getByRole("menuitem").all())
    await expect(item).toBeDisabled();
});

test("locked: the owner moves an AI Employee out to Personal, where it then lists", async ({
  page,
}) => {
  await armOrgLock(page, { team: LOCKED });
  await page.goto("/");

  await teamTab(page, "Settings").click();
  await page
    .getByRole("button", { name: /^Move to another organization/ })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Personal", exact: true }).click();
  await expect(dialog).toContainText(
    `${SEED_AGENT_NAME} will move to Personal, where only you work with it.`,
  );
  await dialog.getByRole("button", { name: "Move AI Employee" }).click();

  // The app switched to Personal, which works, and the employee is there.
  await expect(statusBanner(page)).toHaveCount(0);
  await expect(
    page.locator("[data-sidebar-item]").filter({ hasText: SEED_AGENT_NAME }),
  ).toBeVisible();
  const acme = await fetch(`${FAKE_HOST_URL}/agents`, {
    headers: { "x-houston-org": TEAM.slug },
  });
  const names = ((await acme.json()) as { name: string }[]).map((a) => a.name);
  expect(names).not.toContain(SEED_AGENT_NAME);
});

test("Move to free tier names the org that locks instead, then the strip clears", async ({
  page,
}) => {
  await armOrgLock(page, { team: LOCKED });
  await page.goto("/");

  await statusBanner(page)
    .getByRole("button", { name: "Move to free tier" })
    .click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText(
    "Acme unlocks and moves to the free tier. Personal leaves the free tier and locks until someone pays for it.",
  );
  await dialog.getByRole("button", { name: "Move to free tier" }).click();

  await expect(statusBanner(page)).toHaveCount(0);
  expect((await planCalls()).map((call) => call.route)).toContain("org_free");
});

test("Delete org sends the owner to the Danger zone", async ({ page }) => {
  await armOrgLock(page, { team: LOCKED, caps: { workspaceDelete: true } });
  await page.goto("/");

  await statusBanner(page).getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: "Delete org" }).click();
  await expect(
    page
      .getByRole("button", { name: /^Delete workspace/ })
      .or(page.getByText("Delete workspace", { exact: true }))
      .first(),
  ).toBeVisible();
});

test("locked, a member: ask the owner, no Unlock, in the strip and the composer", async ({
  page,
}) => {
  await armOrgLock(page, {
    team: { ...LOCKED, isBillingOwner: false },
    role: "user",
  });
  await page.goto("/");
  await askOwnerOnly(
    page,
    "You can still read everything. Ask the owner who pays for it to unlock it.",
  );
  await missionCard(page, "Plan a trip to Tokyo").click();
  const card = page.getByTestId("org-locked-card");
  await expect(card).toContainText(
    "Acme is locked. Ask the owner who pays for it to unlock it.",
  );
  await expect(card.getByRole("button")).toHaveCount(0);
});

test("locked, a second owner who does not pay: ask the owner, no Unlock", async ({
  page,
}) => {
  await armOrgLock(page, {
    team: { ...LOCKED, isBillingOwner: false },
    role: "owner",
  });
  await page.goto("/");
  await askOwnerOnly(
    page,
    "You can still read everything and move AI Employees out. Ask the owner who pays for it to unlock it.",
  );
});

test("past due: Fix payment opens the portal for the owner who pays, never a checkout, and clears once paid", async ({
  page,
}) => {
  await stubOpener(page, false);
  await armOrgLock(page, { team: PAST_DUE });
  await page.goto("/");

  const banner = statusBanner(page);
  await expect(banner).toHaveAttribute("data-state", "past_due");
  await expect(banner).toContainText(
    "A payment for Acme didn't go through. It locks on October 19 unless the payment is fixed.",
  );
  await banner.getByRole("button", { name: "Fix payment" }).click();
  await expect.poll(() => openedUrls(page)).toEqual([PORTAL_URL]);
  const routes = (await planCalls()).map((call) => call.route);
  expect(routes).toContain("portal");
  expect(routes).not.toContain("checkout");
  await expect(
    banner.getByRole("button", { name: "Fix payment" }),
  ).toBeDisabled();
  // The fixed payment's webhook lands late: the app's own poll clears the
  // strip, with no focus or reload.
  await setTeamBilling(orgBilling({ tier: "paid" }));
  await page.clock.runFor(5_000);
  await expect(banner).toHaveCount(0);
  // Past due still works: the composer stays.
  await missionCard(page, "Plan a trip to Tokyo").click();
  await expect(page.getByTestId("org-locked-card")).toHaveCount(0);
});

test("past due, an admin: the state, ask the owner, no button", async ({
  page,
}) => {
  await armOrgLock(page, {
    team: { ...PAST_DUE, isBillingOwner: false },
    role: "admin",
  });
  await page.goto("/");
  await askOwnerOnly(page, "Ask the owner who pays for it to fix the payment.");
});

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the strip runs full width with its actions on their own row", async ({
    page,
  }) => {
    await armOrgLock(page, { team: LOCKED });
    await page.goto("/");
    const banner = statusBanner(page);
    await expect(banner).toBeVisible();
    const box = await banner.boundingBox();
    expect(box?.width).toBe(390);
    const text = await banner.locator("p").first().boundingBox();
    const unlock = await banner
      .getByRole("button", { name: "Unlock" })
      .boundingBox();
    expect(unlock && text && unlock.y > text.y + text.height - 1).toBe(true);
  });
});
