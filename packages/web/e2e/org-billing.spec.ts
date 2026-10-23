import { FAKE_HOST_URL } from "@houston/fake-host";
import type { OrgBilling } from "@houston/wire-types";
import type { Page } from "@playwright/test";
import { NEW_TASK_PLACEHOLDER } from "./support/composer";
import { expect, test } from "./support/fixtures";
import { openNewMission } from "./support/mission";
import {
  armPlan,
  CHECKOUT_URL,
  freePlan,
  installPlanClock,
  openedUrls,
  openOrgBilling,
  orgBilling,
  stubOpener,
} from "./support/plan";
import { expectAdminSections, openAdmin } from "./support/settings-nav";
import { workspaceMenuTrigger } from "./support/workspace-menu";

/**
 * Org billing per reader on a team org: the billing owner pays, other owners
 * and admins see the state and seats and are told to ask the owner, and plain
 * members never see Billing but read where the shared pool stands. Creating
 * an org while the free slot is taken offers a paid org and its checkout.
 */

const TEAM = { slug: "00000000000000ab", name: "Acme Team" };

function teamBilling(patch: Partial<OrgBilling>): OrgBilling {
  return {
    tier: "free",
    status: "active",
    lockAt: null,
    lockReason: null,
    freeSlot: true,
    isBillingOwner: true,
    seats: 3,
    seatPriceCents: 1500,
    seatGraceEndsAt: null,
    usage: {
      scope: "org",
      used: 34,
      limit: 40,
      resetsAt: "2026-10-07T17:00:00.000Z",
    },
    routines: null,
    ...patch,
  };
}

async function arm(path: string, data: unknown): Promise<void> {
  const res = await fetch(`${FAKE_HOST_URL}/__test__/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  });
  expect(res.ok).toBe(true);
}

/** A Spaces caller with `role` in one team whose billing is `billing`. */
async function armTeam(
  role: "owner" | "admin" | "user",
  billing: OrgBilling,
): Promise<void> {
  await arm("capabilities", {
    multiplayer: true,
    teams: true,
    spaces: true,
    role,
  });
  await arm("workspaces", { teams: [{ ...TEAM, billing }] });
}

async function enterTeam(page: Page): Promise<void> {
  await page.goto("/");
  const trigger = workspaceMenuTrigger(page);
  await trigger.click();
  await page.getByRole("menuitemcheckbox", { name: TEAM.name }).click();
  await expect(trigger.getByText(TEAM.name, { exact: true })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await installPlanClock(page);
});

test("a member sees the pool and who to ask, never Billing", async ({
  page,
}) => {
  await armTeam("user", teamBilling({ isBillingOwner: false }));
  await enterTeam(page);

  const row = page.getByTestId("sidebar-footer").getByTestId("plan-upgrade");
  await expect(row).toHaveAttribute("role", "status");
  await expect(row).toContainText("85% used");
  await expect(row).toContainText("Ask the owner");
  await expect(row.locator("button")).toHaveCount(0);

  await openNewMission(page);
  await expect(page.getByText("Ask the owner to upgrade.")).toBeVisible();
  await expect(page.getByPlaceholder(NEW_TASK_PLACEHOLDER)).toBeEditable();
});

test("a member at the limit is told to ask the owner, with no Upgrade", async ({
  page,
}) => {
  await armTeam(
    "user",
    teamBilling({
      isBillingOwner: false,
      usage: {
        scope: "org",
        used: 40,
        limit: 40,
        resetsAt: "2026-10-07T17:00:00.000Z",
      },
    }),
  );
  await enterTeam(page);
  await page
    .locator("[data-screen-active='true']")
    .locator('[data-tour-target="newMission"]')
    .first()
    .click();

  await expect(page.getByText("Weekly usage limit reached")).toBeVisible();
  await expect(
    page.getByText(/Ask the owner to upgrade so everyone can keep going now/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Upgrade", exact: true }),
  ).toHaveCount(0);
});

test("an admin sees the state and seats and who to ask, with no button", async ({
  page,
}) => {
  await armTeam(
    "admin",
    teamBilling({
      tier: "paid",
      freeSlot: false,
      usage: null,
      isBillingOwner: false,
    }),
  );
  await enterTeam(page);
  await openAdmin(page);
  await expectAdminSections(page, [
    "Org chart",
    "People",
    "Billing",
    "Activity",
  ]);
  const billing = await openOrgBilling(page);

  await expect(billing.getByText("3 seats, $45 a month")).toBeVisible();
  await expect(
    billing.getByText(
      "Only the owner who pays for this organization can change its plan.",
      { exact: false },
    ),
  ).toBeVisible();
  await expect(billing.getByRole("button")).toHaveCount(0);
});

test("a co-owner who does not pay sees a free org's seats and who to ask", async ({
  page,
}) => {
  await armTeam("owner", teamBilling({ isBillingOwner: false }));
  await enterTeam(page);
  const billing = await openOrgBilling(page);

  await expect(
    billing.getByText("3 members share one weekly allowance"),
  ).toBeVisible();
  await expect(billing.getByText("85% used")).toBeVisible();
  await expect(
    billing.getByText(/^Only the owner who pays for this organization/),
  ).toBeVisible();
  await expect(billing.getByRole("button")).toHaveCount(0);
});

test("the billing owner sees a seat grace's price today and the total after", async ({
  page,
}) => {
  await armTeam(
    "owner",
    teamBilling({
      tier: "paid",
      freeSlot: false,
      usage: null,
      seatGraceEndsAt: "2026-11-04T17:00:00.000Z",
    }),
  );
  await enterTeam(page);
  const billing = await openOrgBilling(page);

  await expect(
    billing.getByText(/^\$15 a month until Nov 4, 2026, then \$45 a month$/),
  ).toBeVisible();
  await expect(
    billing.getByRole("button", { name: "Manage billing" }),
  ).toBeVisible();
});

test("creating an org while the free slot is taken offers a paid org and its checkout", async ({
  page,
}) => {
  await stubOpener(page, false);
  await arm("capabilities", {
    multiplayer: true,
    teams: true,
    spaces: true,
    role: "owner",
  });
  // The armed plan lists the Personal org as the one holding the free slot.
  await armPlan({ summary: freePlan() });
  await page.goto("/");
  await workspaceMenuTrigger(page).click();
  await page.getByRole("menuitem", { name: "Create organization" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox").fill("Labs");
  await dialog.getByRole("button", { name: "Create organization" }).click();

  await expect(
    dialog.getByRole("heading", { name: "Create Labs as a paid organization" }),
  ).toBeVisible();
  await expect(
    dialog.getByText(
      "Each person gets one organization on the free tier, and yours is Personal.",
    ),
  ).toBeVisible();
  await expect(
    dialog.getByText(/Labs costs \$15 per member a month\./),
  ).toBeVisible();
  // An expected state: nothing reports it as a bug.
  await expect(page.getByRole("alert")).toHaveCount(0);

  await dialog.getByRole("button", { name: "Continue to payment" }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => openedUrls(page)).toEqual([CHECKOUT_URL]);
  await expect(page.getByText('Finish paying for "Labs"')).toBeVisible();
  await expect(workspaceMenuTrigger(page)).toContainText("Labs");
  // The new org waits on its payment: its Billing offers the checkout again.
  const billing = await openOrgBilling(page);
  await expect(billing.getByRole("button", { name: "Upgrade" })).toBeVisible();
  await expect(orgBilling(page).getByText("Locked")).toBeVisible();
});

test("a paid create whose checkout the browser refused offers it in the toast", async ({
  page,
}) => {
  await stubOpener(page, true);
  await arm("capabilities", {
    multiplayer: true,
    teams: true,
    spaces: true,
    role: "owner",
  });
  await armPlan({ summary: freePlan() });
  await page.goto("/");
  await workspaceMenuTrigger(page).click();
  await page.getByRole("menuitem", { name: "Create organization" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox").fill("Labs");
  await dialog.getByRole("button", { name: "Create organization" }).click();
  await dialog.getByRole("button", { name: "Continue to payment" }).click();

  await expect(dialog).toBeHidden();
  await expect(
    page.getByText(/Your browser didn't open the checkout/),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  const before = (await openedUrls(page)).length;
  await page.getByRole("button", { name: "Open checkout" }).click();
  await expect
    .poll(async () => (await openedUrls(page)).length)
    .toBe(before + 1);
  expect((await openedUrls(page)).at(-1)).toBe(CHECKOUT_URL);
});
