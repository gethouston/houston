import { expect, test } from "./support/fixtures";
import { installPlanClock, planCalls } from "./support/plan";
import {
  armFake,
  enterPromoTeam,
  promoBilling,
  promoModal,
} from "./support/promo-ended";

/**
 * The promo-ended notice: the billing owner of a team still on the $15
 * promotional monthly seat price hears it moves to $20 at the next charge,
 * and switches to yearly (preselected) or keeps monthly. A declined card
 * keeps the offer up with a toast; "Maybe later" closes it for the session.
 */

const routes = async () => (await planCalls()).map((call) => call.route);

test.beforeEach(async ({ page }) => {
  await installPlanClock(page);
});

test("switching to yearly shows what the org pays now, and the notice is gone", async ({
  page,
}) => {
  await enterPromoTeam(page, promoBilling());
  const modal = promoModal(page);
  await expect(
    modal.getByRole("heading", { name: "Your promotional price is ending" }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(modal.getByRole("radio", { name: /^Yearly/ })).toBeChecked();
  await expect(modal).toContainText(
    "$540 a year for 3 members, charged today. The unused part of this month is credited.",
  );

  await modal.getByRole("button", { name: "Switch to yearly" }).click();
  await expect(
    modal.getByRole("heading", { name: "You're on yearly now" }),
  ).toBeVisible();
  await expect(modal).toContainText(
    "Acme keeps paying $15 per member a month.",
  );
  await expect(modal).toContainText("$540 on");
  expect(await routes()).toContain("switch_to_yearly");
  await modal.getByRole("button", { name: "Done" }).click();
  await expect(modal).toBeHidden();

  // The switch cleared the notice on the gateway: a new app open shows none.
  await page.reload();
  await expect(page.getByTestId("sidebar-footer")).toBeVisible();
  await expect(promoModal(page)).toHaveCount(0);
});

test("continuing monthly stores the dismissal and says what the org pays", async ({
  page,
}) => {
  await enterPromoTeam(page, promoBilling());
  const modal = promoModal(page);
  await modal.getByText("Monthly", { exact: true }).click({ timeout: 15_000 });
  await expect(modal).toContainText("$60 a month for 3 members, from");
  await modal.getByRole("button", { name: "Continue monthly at $20" }).click();
  await expect(
    modal.getByRole("heading", { name: "You're staying on monthly" }),
  ).toBeVisible();
  expect(await routes()).toEqual(["price_notice_dismiss"]);
  await modal.getByRole("button", { name: "Got it" }).click();
  await expect(modal).toBeHidden();
});

test("a declined card keeps the offer up and says so, nothing reported", async ({
  page,
}) => {
  await enterPromoTeam(page, promoBilling());
  await armFake("switch-yearly", { decline: true });
  const modal = promoModal(page);
  await modal
    .getByRole("button", { name: "Switch to yearly" })
    .click({ timeout: 15_000 });
  await expect(page.getByText("Your card was declined")).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(
    modal.getByRole("heading", { name: "Your promotional price is ending" }),
  ).toBeVisible();
});

test("an org already on yearly closes the offer once the switch says so", async ({
  page,
}) => {
  await enterPromoTeam(page, promoBilling({ interval: "year" }));
  const modal = promoModal(page);
  await modal
    .getByRole("button", { name: "Switch to yearly" })
    .click({ timeout: 15_000 });
  await expect(modal).toBeHidden();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("Maybe later closes it for the session and calls nothing", async ({
  page,
}) => {
  await enterPromoTeam(page, promoBilling());
  const modal = promoModal(page);
  await modal
    .getByRole("button", { name: "Maybe later" })
    .first()
    .click({ timeout: 15_000 });
  await expect(modal).toBeHidden();
  expect(await routes()).toEqual([]);
});

test("nobody else sees it: a co-owner who does not pay", async ({ page }) => {
  await enterPromoTeam(page, promoBilling({ isBillingOwner: false }));
  await expect(page.getByTestId("sidebar-footer")).toBeVisible();
  await expect(promoModal(page)).toHaveCount(0);
});
