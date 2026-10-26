import { FAKE_HOST_URL } from "@houston/fake-host";
import type { Page } from "@playwright/test";
import { expect, test } from "../support/fixtures";
import { openMoreMenu } from "../support/mobile-nav";
import { screen } from "../support/nav-common";
import { openAdminSection } from "../support/settings-nav";

/**
 * Yearly seats on the phone: the desktop twin (`../org-seat-charge.spec.ts`)
 * covers the flows; this proves the add row, the note and the charge dialog
 * fit the phone, with the dialog's buttons stacked full width.
 */

const TEAM = { slug: "00000000000000ab", name: "Acme Team" };

async function arm(path: string, data: unknown): Promise<void> {
  const res = await fetch(`${FAKE_HOST_URL}/__test__/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  });
  expect(res.ok).toBe(true);
}

async function expectNoOverflow(page: Page): Promise<void> {
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);
}

test("the charge dialog fits the phone and adds the person", async ({
  page,
}) => {
  await arm("capabilities", {
    multiplayer: true,
    teams: true,
    spaces: true,
    role: "owner",
  });
  await arm("workspaces", {
    teams: [
      {
        ...TEAM,
        billing: {
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
          renewsAt: "2027-03-26T12:00:00.000Z",
          priceNotice: null,
          paidSeats: 2,
          seatsInUse: 2,
          usage: null,
          routines: null,
        },
      },
    ],
  });
  await page.goto("/");
  const menu = await openMoreMenu(page);
  await menu.getByTestId("more-workspace-switcher").tap();
  await page.getByRole("menuitemcheckbox", { name: TEAM.name }).tap();
  // Switching leaves the More card open; Admin is reached through it again.
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-slot='sheet-overlay']")).toHaveCount(0);
  await openAdminSection(page, "People");
  const people = screen(page).locator("[data-admin-section-body='people']");

  await expect(people.getByTestId("people-seat-note")).toBeVisible();
  await expectNoOverflow(page);
  await people.getByLabel("Email").fill("jordan@company.com");
  await people.getByRole("button", { name: "Add", exact: true }).tap();

  const dialog = page.getByTestId("seat-charge-dialog");
  const pay = dialog.getByRole("button", { name: /^Pay / });
  const cancel = dialog.getByRole("button", { name: "Cancel" });
  await expect(pay).toBeVisible();
  const [payBox, cancelBox] = [
    await pay.boundingBox(),
    await cancel.boundingBox(),
  ];
  if (!payBox || !cancelBox) throw new Error("the dialog is not laid out");
  // Stacked: the same width, the primary action on top.
  expect(Math.round(payBox.width)).toBe(Math.round(cancelBox.width));
  expect(payBox.y).toBeLessThan(cancelBox.y);
  await expectNoOverflow(page);

  await pay.tap();
  await expect(dialog).toBeHidden();
  await expect(people.getByTestId("people-add-done")).toContainText(
    "for their seat.",
  );
});
