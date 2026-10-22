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
import { armPlan, billingScreen, freePlan, openBilling } from "./support/plan";

/**
 * A payer's paid pick the gateway refuses (`not_payer`) once, while the
 * refetch still names them a payer: the refusal swaps no choice, so every GET
 * keeps answering the payer choice. The picker stays on the free step, sends
 * the free pick alone, which stores, and counts no paid step through the
 * success step.
 */

const REFUSE_ONCE = { refusals: [{ refuse: "not_payer" as const }] };

test.beforeEach(async ({ page }) => {
  await installChoiceClock(page);
});

const sets = async () =>
  (await choiceCalls())
    .filter((call) => call.route === "set")
    .map((call) => call.body);

const NO_SUBSCRIPTION = "There's no subscription to move";

test("after a refused paid pick the modal drops the paid step from progress, Back and the resend", async ({
  page,
}) => {
  await armCapabilities(SPACES_OWNER_CAPS);
  await armChoice(payerChoice(), undefined, REFUSE_ONCE);
  await page.goto("/");
  const modal = choiceModal(page);
  await openPicker(modal, true);
  await modal.getByRole("button", { name: "Use it for La Fila" }).click();
  await expect(modal).toContainText("Step 4 of 5");
  await modal
    .getByRole("button", { name: "Keep Innova on the free tier" })
    .click();
  await expect(page.getByText(NO_SUBSCRIPTION)).toBeVisible();
  expect(await sets()).toEqual([
    { freeOrgSlug: INNOVA.slug, paidOrgSlug: LA_FILA.slug },
  ]);

  // The free step is now the picker's only step.
  await expect(modal).toContainText("Step 3 of 4");
  await expect(modal).not.toContainText("of 5");
  await expect(modal.getByRole("radio", { name: /La Fila/ })).toBeEnabled();

  // Back leaves the picker for the intro, never the refused paid step.
  await modal.getByRole("button", { name: "Back" }).click();
  await expect(
    page.getByRole("dialog", { name: "Nothing gets deleted" }),
  ).toBeVisible();
  await expect(modal).toContainText("Step 2 of 4");
  await modal.getByRole("button", { name: "Next", exact: true }).click();
  await expect(
    page.getByRole("dialog", {
      name: "Which organization stays on the free tier?",
    }),
  ).toBeVisible();
  await expect(modal).toContainText("Step 3 of 4");
  await expect(modal.getByRole("radio", { name: /Innova/ })).toBeChecked();

  await modal
    .getByRole("button", { name: "Keep Innova on the free tier" })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Innova stays on the free tier" }),
  ).toBeVisible();
  await expect(modal).toContainText("Step 4 of 4");
  expect((await sets())[1]).toEqual({ freeOrgSlug: INNOVA.slug });
  await modal.getByRole("button", { name: "Done" }).click();
  await expect(modal).toBeHidden();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("after a refused paid pick the Settings picker has one step, no Back, and resends the free pick alone", async ({
  page,
}) => {
  await armCapabilities({ ...SPACES_OWNER_CAPS, plan: true });
  await armPlan({ summary: freePlan() });
  await armChoice(payerChoice(), undefined, REFUSE_ONCE);
  const billing = await openSettingsPicker(page);
  await billing.getByRole("button", { name: "Choose" }).click();
  const picker = settingsPicker(page);
  await expect(picker).toContainText("Step 1 of 3");
  await picker.getByRole("button", { name: "Use it for La Fila" }).click();
  await expect(picker).toContainText("Step 2 of 3");
  await picker
    .getByRole("button", { name: "Keep Innova on the free tier" })
    .click();
  await expect(page.getByText(NO_SUBSCRIPTION)).toBeVisible();

  await expect(picker).not.toContainText(/Step \d+ of/);
  await expect(picker.getByRole("button", { name: "Back" })).toHaveCount(0);
  await picker
    .getByRole("button", { name: "Keep Innova on the free tier" })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Innova stays on the free tier" }),
  ).toBeVisible();
  // One step and its success step: no progress there either.
  await expect(picker).not.toContainText(/Step \d+ of/);
  expect((await sets())[1]).toEqual({ freeOrgSlug: INNOVA.slug });
  await picker.getByRole("button", { name: "Done" }).click();
  await expect(picker).toBeHidden();
  const change = billing.getByRole("button", { name: "Change" });
  await expect(change).toBeFocused();

  // A fresh open forgets the refusal: the payer picks the paid org first.
  await change.click();
  await expect(picker).toContainText("Step 1 of 3");
  await expect(
    picker.getByRole("button", { name: "Use it for La Fila" }),
  ).toBeVisible();
});

test("the Settings picker reopens on the stored pick, not the last open's draft", async ({
  page,
}) => {
  await armCapabilities({ ...SPACES_OWNER_CAPS, plan: true });
  await armPlan({ summary: freePlan() });
  await armChoice(ownerChoice({ freeOrgSlug: INNOVA.slug }));
  // A stored pick asks nothing on open: straight to Billing.
  await page.goto("/");
  await expect(page.getByRole("main")).toBeVisible();
  await openBilling(page);
  const billing = billingScreen(page);
  const change = billing.getByRole("button", { name: "Change" });
  await change.click();
  const picker = settingsPicker(page);
  await expect(picker.getByRole("radio", { name: /Innova/ })).toBeChecked();
  await picker.getByText("Personal", { exact: true }).click();
  await expect(picker.getByRole("radio", { name: /Personal/ })).toBeChecked();
  await page.keyboard.press("Escape");
  await expect(picker).toBeHidden();

  await change.click();
  await expect(picker.getByRole("radio", { name: /Innova/ })).toBeChecked();
  await expect(
    picker.getByRole("radio", { name: /Personal/ }),
  ).not.toBeChecked();
  expect(await sets()).toEqual([]);
});
