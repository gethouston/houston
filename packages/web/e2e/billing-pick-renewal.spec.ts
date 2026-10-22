import {
  armCapabilities,
  armChoice,
  choiceCalls,
  choiceModal,
  INNOVA,
  installChoiceClock,
  LA_FILA,
  openPicker,
  ownerChoice,
  payerChoice,
  SPACES_OWNER_CAPS,
} from "./support/billing-choice";
import { expect, test } from "./support/fixtures";

/**
 * A refused paid pick that a later choice settles in the same open. The
 * gateway refuses the pair (`not_payer`) and the refetch names no payer,
 * which confirms the refusal. A later refusal's refetch names the payer again
 * (a subscription started in another tab): the paid step comes back, and the
 * pick stores with the paid org.
 */

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
  await armChoice(payerChoice(), undefined, {
    refusals: [
      { refuse: "not_payer", after: ownerChoice() },
      { refuse: "not_owner", after: payerChoice() },
    ],
  });
  await page.goto("/");
  const modal = choiceModal(page);
  await openPicker(modal, true);
  await modal.getByRole("button", { name: "Use it for La Fila" }).click();
  await modal.getByRole("button", { name: "Keep Innova free" }).click();

  // No payer: the free step is the picker's only one.
  await expect(modal).toContainText("Step 3 of 4");
  await expect(modal.getByRole("radio", { name: /Innova/ })).toBeChecked();
  await modal.getByRole("button", { name: "Keep Innova free" }).click();
  await expect.poll(sets).toHaveLength(2);

  // A payer again: the paid step returns, and the pick carries the paid org.
  await expect(modal).toContainText("Step 3 of 5");
  await modal.getByRole("button", { name: "Use it for La Fila" }).click();
  await expect(modal).toContainText("Step 4 of 5");
  await modal.getByRole("button", { name: "Keep Innova free" }).click();
  await expect(
    page.getByRole("dialog", { name: "Innova stays free" }),
  ).toBeVisible();
  await expect(modal).toContainText("Step 5 of 5");
  expect(await sets()).toEqual([
    { freeOrgSlug: INNOVA.slug, paidOrgSlug: LA_FILA.slug },
    { freeOrgSlug: INNOVA.slug },
    { freeOrgSlug: INNOVA.slug, paidOrgSlug: LA_FILA.slug },
  ]);
});
