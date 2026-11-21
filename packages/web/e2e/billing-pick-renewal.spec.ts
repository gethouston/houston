import {
  armCapabilities,
  armChoice,
  choiceCalls,
  choiceModal,
  INNOVA,
  installChoiceClock,
  LA_FILA,
  openPicker,
  openSettingsPicker,
  ownerChoice,
  payerChoice,
  SPACES_OWNER_CAPS,
  settingsPicker,
} from "./support/billing-choice";
import { expect, test } from "./support/fixtures";
import { armPlan, freePlan } from "./support/plan";

const RENEWAL = {
  refusals: [
    { refuse: "not_payer" as const, after: ownerChoice() },
    { refuse: "not_owner" as const, after: payerChoice() },
  ],
};

test.beforeEach(async ({ page }) => {
  await installChoiceClock(page);
});

const sets = async () =>
  (await choiceCalls())
    .filter((call) => call.route === "set")
    .map((call) => call.body);

test("a payer refused, then none, then a payer again gets the paid step back", async ({
  page,
}) => {
  await armCapabilities(SPACES_OWNER_CAPS);
  await armChoice(payerChoice(), undefined, RENEWAL);
  await page.goto("/");
  const modal = choiceModal(page);
  await openPicker(modal, true);
  await modal.getByRole("button", { name: "Use it for La Fila" }).click();
  await modal
    .getByRole("button", { name: "Keep Innova on the free tier" })
    .click();

  await expect(modal).toContainText("Step 3 of 4");
  await expect(modal.getByRole("radio", { name: /Innova/ })).toBeChecked();
  await modal
    .getByRole("button", { name: "Keep Innova on the free tier" })
    .click();
  await expect.poll(sets).toHaveLength(2);

  await expect(modal).toContainText("Step 3 of 5");
  await modal.getByRole("button", { name: "Use it for La Fila" }).click();
  await expect(modal).toContainText("Step 4 of 5");
  await modal
    .getByRole("button", { name: "Keep Innova on the free tier" })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Innova stays on the free tier" }),
  ).toBeVisible();
  await expect(modal).toContainText("Step 5 of 5");
  expect(await sets()).toEqual([
    { freeOrgSlug: INNOVA.slug, paidOrgSlug: LA_FILA.slug },
    { freeOrgSlug: INNOVA.slug },
    { freeOrgSlug: INNOVA.slug, paidOrgSlug: LA_FILA.slug },
  ]);
});

test("the Settings picker gets the paid step back when a payer returns", async ({
  page,
}) => {
  await armCapabilities({ ...SPACES_OWNER_CAPS, plan: true });
  await armPlan({ summary: freePlan() });
  await armChoice(payerChoice(), undefined, RENEWAL);
  const billing = await openSettingsPicker(page);
  await billing.getByRole("button", { name: "Choose" }).click();
  const picker = settingsPicker(page);
  await expect(picker).toContainText("Step 1 of 3");
  await picker.getByRole("button", { name: "Use it for La Fila" }).click();
  await picker
    .getByRole("button", { name: "Keep Innova on the free tier" })
    .click();

  await expect(picker).not.toContainText(/Step \d+ of/);
  await expect(picker.getByRole("radio", { name: /Innova/ })).toBeChecked();
  await picker
    .getByRole("button", { name: "Keep Innova on the free tier" })
    .click();
  await expect.poll(sets).toHaveLength(2);

  await expect(picker).toContainText("Step 1 of 3");
  await picker.getByRole("button", { name: "Use it for La Fila" }).click();
  await expect(picker).toContainText("Step 2 of 3");
  await picker
    .getByRole("button", { name: "Keep Innova on the free tier" })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Innova stays on the free tier" }),
  ).toBeVisible();
  await expect(picker).toContainText("Step 3 of 3");
  expect(await sets()).toEqual([
    { freeOrgSlug: INNOVA.slug, paidOrgSlug: LA_FILA.slug },
    { freeOrgSlug: INNOVA.slug },
    { freeOrgSlug: INNOVA.slug, paidOrgSlug: LA_FILA.slug },
  ]);
});
