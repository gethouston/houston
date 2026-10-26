import { FAKE_HOST_URL } from "@houston/fake-host";
import type { OrgBilling } from "@houston/wire-types";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { screen } from "./support/nav-common";
import { openAdmin, openAdminSection } from "./support/settings-nav";
import { workspaceMenuTrigger } from "./support/workspace-menu";

/**
 * Yearly seats on the People tab: the payer of a yearly org sees the price
 * of a new seat before adding someone and pays it in a dialog; a declined
 * card adds nobody; a free paid seat is taken at no charge; another owner
 * cannot buy a seat; removing someone keeps the seat paid until renewal; and
 * the billing card counts the paid seats against the seats in use.
 */

const TEAM = { slug: "00000000000000ab", name: "Acme Team" };
const RENEWS = "2027-03-26T12:00:00.000Z";

function yearly(patch: Partial<OrgBilling> = {}): OrgBilling {
  return {
    tier: "paid",
    status: "active",
    lockAt: null,
    lockReason: null,
    freeSlot: false,
    isBillingOwner: true,
    seats: 2,
    interval: "year",
    seatPriceCents: 18000,
    seatPrices: { monthlyCents: 2000, annualCents: 18000 },
    seatGraceEndsAt: null,
    renewsAt: RENEWS,
    priceNotice: null,
    paidSeats: 2,
    seatsInUse: 2,
    usage: null,
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

async function openPeople(page: Page, billing: OrgBilling): Promise<Locator> {
  await arm("capabilities", {
    multiplayer: true,
    teams: true,
    spaces: true,
    role: "owner",
  });
  await arm("workspaces", { teams: [{ ...TEAM, billing }] });
  await page.goto("/");
  const trigger = workspaceMenuTrigger(page);
  await trigger.click();
  await page.getByRole("menuitemcheckbox", { name: TEAM.name }).click();
  await expect(trigger.getByText(TEAM.name, { exact: true })).toBeVisible();
  await openAdmin(page);
  await openAdminSection(page, "People");
  return screen(page).locator("[data-admin-section-body='people']");
}

async function addSomeone(people: Locator, email: string): Promise<void> {
  await people.getByLabel("Email").fill(email);
  await people.getByRole("button", { name: "Add", exact: true }).click();
}

test("the payer sees the price, pays it, and the person is added", async ({
  page,
}) => {
  const people = await openPeople(page, yearly());
  await expect(people.getByTestId("people-seat-note")).toContainText(
    "Every paid seat is in use.",
  );
  await addSomeone(people, "jordan@company.com");

  const dialog = page.getByTestId("seat-charge-dialog");
  await expect(
    dialog.getByText("Add a seat for jordan@company.com?"),
  ).toBeVisible();
  await expect(dialog.getByText("Charged now")).toBeVisible();
  await expect(
    dialog.getByText(
      "For the time left until your plan renews on Mar 26, 2027.",
      { exact: false },
    ),
  ).toBeVisible();
  await expect(dialog.getByText("$540 a year")).toBeVisible();
  await dialog.getByRole("button", { name: /^Pay \$[\d.,]+ and add$/ }).click();

  await expect(dialog).toBeHidden();
  await expect(people.getByTestId("people-add-done")).toContainText(
    "to your card for their seat.",
  );
});

test("a declined card adds nobody and offers Try again", async ({ page }) => {
  const people = await openPeople(page, yearly());
  await arm("seat-charge", { result: "decline" });
  await addSomeone(people, "jordan@company.com");

  const dialog = page.getByTestId("seat-charge-dialog");
  await dialog.getByRole("button", { name: /^Pay / }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Your card was declined",
  );
  await expect(
    dialog.getByRole("button", { name: "Manage billing" }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Try again" }).click();
  await expect(dialog).toBeHidden();
});

test("a free paid seat is taken at no charge", async ({ page }) => {
  const people = await openPeople(page, yearly({ paidSeats: 3 }));
  await expect(people.getByTestId("people-seat-note")).toContainText(
    "1 paid seat is free.",
  );
  await addSomeone(people, "jordan@company.com");
  await expect(page.getByTestId("seat-charge-dialog")).toHaveCount(0);
  await expect(people.getByTestId("people-add-done")).toContainText(
    "They use a seat you already paid for. No charge.",
  );
});

test("another owner cannot buy a seat", async ({ page }) => {
  const people = await openPeople(page, yearly({ isBillingOwner: false }));
  await expect(people.getByTestId("people-seat-note")).toContainText(
    "only the owner who pays for this organization can add one",
  );
  await people.getByLabel("Email").fill("jordan@company.com");
  await expect(
    people.getByRole("button", { name: "Add", exact: true }),
  ).toBeDisabled();
});

test("the billing card counts the free paid seats", async ({ page }) => {
  await openPeople(page, yearly({ paidSeats: 3 }));
  await openAdminSection(page, "Billing");
  const billing = screen(page).locator("[data-admin-section-body='billing']");
  await expect(billing.getByText("3 paid seats, $540 a year")).toBeVisible();
  await expect(billing.getByText("Renews Mar 26, 2027")).toBeVisible();
  await expect(billing.getByText("2 in use, 1 free")).toBeVisible();
});
