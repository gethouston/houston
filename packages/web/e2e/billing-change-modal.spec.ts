import type { Locator } from "@playwright/test";
import {
  armCapabilities,
  armChoice,
  CHOOSE,
  choiceCalls,
  choiceModal,
  INNOVA,
  installChoiceClock,
  LA_FILA,
  MODAL_TITLE,
  memberChoice,
  openPicker,
  ownerChoice,
  payerChoice,
  SPACES_OWNER_CAPS,
  settingsPicker,
  singleOrgChoice,
} from "./support/billing-choice";
import { expect, test } from "./support/fixtures";
import {
  armPlan,
  billingScreen,
  FREE_ROUTINES,
  freePlan,
  openBilling,
} from "./support/plan";

/**
 * The announcement that plans move to organizations: a modal on app open,
 * cloud only. An owner who still has to pick sees it on every open until they
 * do, and picks in the same frame; everyone else reads it once. It never
 * stacks on a plan dialog.
 */

test.beforeEach(async ({ page }) => {
  await installChoiceClock(page);
});

const routes = async () => (await choiceCalls()).map((call) => call.route);

/** One org's row on the success step: its name and what it becomes. */
const outcome = (frame: Locator, name: string) =>
  frame.getByRole("listitem").filter({ hasText: name });

test("an owner picks the org that stays free from the modal, and it stays gone", async ({
  page,
}) => {
  await armCapabilities(SPACES_OWNER_CAPS);
  await armChoice(ownerChoice());
  await page.goto("/");

  const modal = choiceModal(page);
  await expect(page.getByRole("dialog", { name: MODAL_TITLE })).toBeVisible({
    timeout: 15_000,
  });
  await expect(modal).toContainText("From Friday, October 23");
  await expect(modal).toContainText("Step 1 of 4");
  await expect(modal.getByRole("listitem")).toHaveText([
    "Every space works like a teamYou can invite people to any of them.",
    "One free organization per accountEveryone in it uses Houston free.",
    "The rest are $15 per member a monthOnly for organizations you want to keep working.",
  ]);
  await expect(modal).not.toContainText(/\d+ messages a week/);
  await modal.getByRole("button", { name: "Next", exact: true }).click();

  await expect(
    page.getByRole("dialog", { name: "Nothing gets deleted" }),
  ).toBeVisible();
  await expect(modal).toContainText("Step 2 of 4");
  await expect(modal.getByRole("listitem")).toHaveText([
    "You can still open themEvery agent, mission and file stays where it is.",
    "Move agents to your free organizationBring the ones you want to keep using.",
    "New conversations wait for a planWhen you open one, you can pay for it there.",
  ]);
  // Back returns to the first page, which alone offers Maybe later.
  await expect(modal.getByRole("button", { name: "Maybe later" })).toHaveCount(
    0,
  );
  await modal.getByRole("button", { name: "Back" }).click();
  await expect(modal).toContainText("Step 1 of 4");
  await openPicker(modal);

  await expect(
    page.getByRole("dialog", { name: "Which organization stays free?" }),
  ).toBeVisible();
  await expect(
    modal.getByRole("radiogroup", { name: "Which organization stays free?" }),
  ).toBeVisible();
  await expect(modal).toContainText("Step 3 of 4");
  await expect(modal).toContainText("Everyone in it uses Houston free.");
  await expect(modal.getByRole("radio")).toHaveCount(3);
  await expect(modal.locator("label").first()).toContainText(
    "La FilaMost active1 member · 396 messages in the last 30 days",
  );
  await expect(modal.getByRole("radio", { name: /La Fila/ })).toBeChecked();
  // A click moves focus to the pick without a keyboard ring.
  await expect(modal.getByRole("radio", { name: /La Fila/ })).toBeFocused();
  expect(await focusRing(modal.getByRole("radio", { name: /La Fila/ }))).toBe(
    false,
  );

  await modal.getByText("Innova", { exact: true }).click();
  await modal.getByRole("button", { name: "Keep Innova free" }).click();

  // The same frame confirms the pick, and survives the refetch behind it.
  await expect(
    page.getByRole("dialog", { name: "Innova stays free" }),
  ).toBeVisible();
  await expect(modal).toContainText(
    "Here's how your organizations look from Friday, October 23.",
  );
  await expect(outcome(modal, "Innova")).toContainText("Free");
  await expect(outcome(modal, "La Fila")).toContainText("Needs a plan");
  await expect(outcome(modal, "Personal")).toContainText("Needs a plan");
  await expect(modal).toContainText("You can change this in Settings.");
  await expect(modal.getByRole("radio")).toHaveCount(0);
  expect((await choiceCalls()).filter((c) => c.route === "set")).toEqual([
    { route: "set", body: { freeOrgSlug: INNOVA.slug } },
  ]);
  await page.clock.runFor(3_000);
  await expect(modal).toBeVisible();
  await modal.getByRole("button", { name: "Done" }).click();
  await expect(modal).toBeHidden();
  await page.clock.runFor(3_000);
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole("main")).toBeVisible();
  await expect
    .poll(async () => (await routes()).filter((r) => r === "get").length)
    .toBe(2);
  await expect(choiceModal(page)).toBeHidden();
});

test("a Plus payer picks the org the subscription covers first, then the free one", async ({
  page,
}) => {
  await armCapabilities(SPACES_OWNER_CAPS);
  await armChoice(payerChoice());
  await page.goto("/");

  const modal = choiceModal(page);
  await expect(modal).toContainText(
    "Your subscription covers one organization",
    {
      timeout: 15_000,
    },
  );
  await expect(modal).toContainText("Step 1 of 5");
  await openPicker(modal, true);

  await expect(
    page.getByRole("dialog", {
      name: "Which organization does your subscription cover?",
    }),
  ).toBeVisible();
  await expect(modal).toContainText("Step 3 of 5");
  await expect(modal).toContainText("You already pay for Houston");
  await expect(modal.getByRole("radio")).toHaveCount(3);
  await expect(modal.getByRole("radio", { name: /La Fila/ })).toBeChecked();
  await expect(
    modal.getByRole("radio", { name: /Innova/ }),
  ).toHaveAccessibleName("Innova 4 members · $15 each");
  await expect(modal).not.toContainText("a month until");
  await modal.getByText("Innova", { exact: true }).click();
  await modal.getByRole("button", { name: "Use it for Innova" }).click();

  await expect(
    page.getByRole("dialog", { name: "Which organization stays free?" }),
  ).toBeVisible();
  await expect(modal).toContainText("Step 4 of 5");
  // The subscription's org stays listed where it was, but can't stay free.
  await expect(modal.getByRole("radio", { name: /Innova/ })).toBeDisabled();
  await expect(
    modal.getByRole("radio", { name: /Innova/ }),
  ).toHaveAccessibleName(/^Innova Your subscription/);
  await expect(modal.getByRole("radio", { name: /La Fila/ })).toBeChecked();
  // Back keeps the paid pick; going on again returns to the same free pick.
  await modal.getByRole("button", { name: "Back" }).click();
  await expect(modal.getByRole("radio", { name: /Innova/ })).toBeChecked();
  await modal.getByRole("button", { name: "Use it for Innova" }).click();
  await modal.getByRole("button", { name: "Keep La Fila free" }).click();

  await expect(
    page.getByRole("dialog", { name: "La Fila stays free" }),
  ).toBeVisible();
  await expect(outcome(modal, "La Fila")).toContainText("Free");
  await expect(outcome(modal, "Innova")).toContainText("Your subscription");
  // A third org is neither free nor paid for.
  await expect(outcome(modal, "Personal")).toContainText("Needs a plan");
  expect((await choiceCalls()).filter((c) => c.route === "set")).toEqual([
    {
      route: "set",
      body: { freeOrgSlug: LA_FILA.slug, paidOrgSlug: INNOVA.slug },
    },
  ]);
  await modal.getByRole("button", { name: "Done" }).click();
  await expect(modal).toBeHidden();

  await page.reload();
  await expect(page.getByRole("main")).toBeVisible();
  await expect
    .poll(async () => (await routes()).filter((r) => r === "get").length)
    .toBe(2);
  await expect(choiceModal(page)).toBeHidden();
});

const focusRing = (target: Locator) =>
  target.evaluate((el) => el.matches(":focus-visible"));

/** Every animation the element or anything inside it names, by computed style. */
const animated = (target: Locator) =>
  target.evaluate((root) =>
    [root, ...root.querySelectorAll("*")]
      .map((el) => getComputedStyle(el).animationName)
      .filter((name) => name !== "none"),
  );

test("the keyboard walks an owner from the intro to the success step, focus following each step", async ({
  page,
}) => {
  await armCapabilities(SPACES_OWNER_CAPS);
  await armChoice(ownerChoice());
  await page.goto("/");
  const modal = choiceModal(page);
  await expect(
    modal.getByRole("button", { name: "Next", exact: true }),
  ).toBeFocused({ timeout: 15_000 });
  await page.keyboard.press("Enter");
  await expect(
    modal.getByRole("heading", { name: "Nothing gets deleted" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(modal.getByRole("button", { name: CHOOSE })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(modal.getByRole("radio", { name: /La Fila/ })).toBeFocused();
  expect(await focusRing(modal.getByRole("radio", { name: /La Fila/ }))).toBe(
    true,
  );

  // The action names each pick at once: arrowing never replays an animation.
  await page.keyboard.press("ArrowDown");
  await expect(modal.getByRole("radio", { name: /Innova/ })).toBeFocused();
  const keep = modal.getByRole("button", { name: "Keep Innova free" });
  await expect(keep).toBeVisible();
  expect(await animated(keep)).toEqual([]);
  await page.keyboard.press("ArrowDown");
  await expect(
    modal.getByRole("button", { name: "Keep Personal free" }),
  ).toBeVisible();
  expect(
    await animated(modal.getByRole("button", { name: "Keep Personal free" })),
  ).toEqual([]);

  await page.keyboard.press("Tab");
  await expect(
    modal.getByRole("button", { name: "Keep Personal free" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    modal.getByRole("heading", { name: "Personal stays free" }),
  ).toBeFocused();
});

test("the keyboard carries a payer through both steps and back, focus on the pick each time", async ({
  page,
}) => {
  await armCapabilities(SPACES_OWNER_CAPS);
  await armChoice(payerChoice());
  await page.goto("/");
  const modal = choiceModal(page);
  const next = modal.getByRole("button", { name: "Next", exact: true });
  await expect(next).toBeFocused({ timeout: 15_000 });
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await expect(next).toBeFocused();
  await page.keyboard.press("Enter");

  const laFila = modal.getByRole("radio", { name: /La Fila/ });
  await expect(laFila).toBeChecked();
  await expect(laFila).toBeFocused();
  await page.keyboard.press("Tab");
  const use = modal.getByRole("button", { name: "Use it for La Fila" });
  await expect(use).toBeFocused();
  await page.keyboard.press("Enter");

  const innova = modal.getByRole("radio", { name: /Innova/ });
  await expect(innova).toBeChecked();
  await expect(innova).toBeFocused();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(modal.getByRole("button", { name: "Back" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(laFila).toBeFocused();

  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(innova).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    modal.getByRole("button", { name: "Keep Innova free" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    modal.getByRole("heading", { name: "Innova stays free" }),
  ).toBeFocused();
});

test("Escape closes the success step like Done", async ({ page }) => {
  await armCapabilities(SPACES_OWNER_CAPS);
  await armChoice(ownerChoice());
  await page.goto("/");
  const modal = choiceModal(page);
  await openPicker(modal);
  await modal.getByRole("button", { name: "Keep La Fila free" }).click();
  await expect(
    page.getByRole("dialog", { name: "La Fila stays free" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(modal).toBeHidden();
  expect(await routes()).not.toContain("dismiss");
});

test("a refused pick shows its own copy and keeps the picker open", async ({
  page,
}) => {
  await armCapabilities(SPACES_OWNER_CAPS);
  await armChoice(ownerChoice(), "not_owner");
  await page.goto("/");
  const modal = choiceModal(page);
  await openPicker(modal);
  await modal.getByRole("button", { name: "Keep La Fila free" }).click();
  await expect(page.getByText("You don't own that organization")).toBeVisible();
  await expect(modal.getByRole("radio")).toHaveCount(3);
  await expect(modal.getByRole("button", { name: "Done" })).toHaveCount(0);
  await expect(modal).not.toContainText("You can change this in Settings.");
});

test("a refusal that leaves one owned org swaps the picker for the notice", async ({
  page,
}) => {
  await armCapabilities(SPACES_OWNER_CAPS);
  // The other orgs were handed over meanwhile: the refetch owns one org.
  await armChoice(ownerChoice(), "not_owner", {
    afterRefusal: singleOrgChoice(),
  });
  await page.goto("/");
  const modal = choiceModal(page);
  await openPicker(modal);
  await modal.getByRole("button", { name: "Keep La Fila free" }).click();
  await expect(page.getByText("You don't own that organization")).toBeVisible();

  await expect(modal).toContainText("La Fila stays free");
  await expect(modal).toContainText("so you can invite people to La Fila.");
  await expect(modal.getByRole("radio")).toHaveCount(0);
  await expect(modal.getByRole("button", { name: "Got it" })).toBeVisible();
});

test("Maybe later hides it for this session only, and Billing still opens the picker", async ({
  page,
}) => {
  await armCapabilities({ ...SPACES_OWNER_CAPS, plan: true });
  await armPlan({ summary: freePlan() });
  await armChoice(ownerChoice());
  await page.goto("/");

  const modal = choiceModal(page);
  // The text button; the X carries the same name.
  await modal.getByRole("button", { name: "Maybe later" }).first().click({
    timeout: 15_000,
  });
  await expect(modal).toBeHidden();

  await openBilling(page);
  await expect(
    billingScreen(page).getByRole("heading", {
      name: "Choose your free organization",
    }),
  ).toBeVisible();
  await billingScreen(page).getByRole("button", { name: "Choose" }).click();
  const picker = settingsPicker(page);
  await expect(picker.getByRole("radio")).toHaveCount(3);
  await page.keyboard.press("Escape");
  await expect(picker).toBeHidden();
  await expect(
    billingScreen(page).getByRole("button", { name: "Choose" }),
  ).toBeFocused();
  expect(await routes()).not.toContain("dismiss");

  await page.reload();
  await expect(page.getByRole("dialog", { name: MODAL_TITLE })).toBeVisible({
    timeout: 15_000,
  });
  expect(await routes()).not.toContain("dismiss");
});

test("a pick from Billing ends on the success step, and the modal stays gone", async ({
  page,
}) => {
  await armCapabilities({ ...SPACES_OWNER_CAPS, plan: true });
  await armPlan({ summary: freePlan() });
  await armChoice(ownerChoice());
  await page.goto("/");
  await choiceModal(page)
    .getByRole("button", { name: "Maybe later" })
    .first()
    .click({ timeout: 15_000 });

  await openBilling(page);
  await billingScreen(page).getByRole("button", { name: "Choose" }).click();
  const picker = settingsPicker(page);
  await picker.getByText("Innova", { exact: true }).click();
  await picker.getByRole("button", { name: "Keep Innova free" }).click();
  await expect(
    page.getByRole("dialog", { name: "Innova stays free" }),
  ).toBeVisible();
  await expect(outcome(picker, "Innova")).toContainText("Free");
  await expect(outcome(picker, "La Fila")).toContainText("Needs a plan");
  await picker.getByRole("button", { name: "Done" }).click();
  await expect(picker).toBeHidden();
  await expect(billingScreen(page)).toContainText(
    "Innova stays free from October 23.",
  );
  await expect(
    billingScreen(page).getByRole("button", { name: "Change" }),
  ).toBeFocused();

  // Reopening starts on the picker again, on the stored pick.
  await billingScreen(page).getByRole("button", { name: "Change" }).click();
  await expect(picker.getByRole("radio", { name: /Innova/ })).toBeChecked();
  await page.keyboard.press("Escape");
  await expect(picker).toBeHidden();

  await page.reload();
  await expect(page.getByRole("main")).toBeVisible();
  await expect
    .poll(async () => (await routes()).filter((r) => r === "get").length)
    .toBe(2);
  await expect(choiceModal(page)).toBeHidden();
});

test("a pick from Billing just before the window closes keeps its success step", async ({
  page,
}) => {
  await armCapabilities({ ...SPACES_OWNER_CAPS, plan: true });
  await armPlan({ summary: freePlan() });
  // The window closes five minutes after the page clock starts.
  await armChoice(ownerChoice({ changeableUntil: "2026-10-20T17:05:00.000Z" }));
  await page.goto("/");
  await choiceModal(page)
    .getByRole("button", { name: "Maybe later" })
    .first()
    .click({ timeout: 15_000 });

  await openBilling(page);
  await billingScreen(page).getByRole("button", { name: "Choose" }).click();
  const picker = settingsPicker(page);
  await picker.getByRole("button", { name: "Keep La Fila free" }).click();
  await expect(
    page.getByRole("dialog", { name: "La Fila stays free" }),
  ).toBeVisible();

  await page.clock.runFor("06:00");
  // The row goes with the window; the confirmation stays until it is closed.
  await expect(
    billingScreen(page).getByRole("heading", {
      name: "Choose your free organization",
    }),
  ).toBeHidden();
  await expect(
    page.getByRole("dialog", { name: "La Fila stays free" }),
  ).toBeVisible();
  await picker.getByRole("button", { name: "Done" }).click();
  await expect(picker).toBeHidden();
  await expect(
    billingScreen(page).getByRole("heading", { level: 1 }),
  ).toBeFocused();
});

test("closing with the X on the picker is also Maybe later for an owner who has to pick", async ({
  page,
}) => {
  await armCapabilities(SPACES_OWNER_CAPS);
  await armChoice(ownerChoice());
  await page.goto("/");
  const modal = choiceModal(page);
  await openPicker(modal);
  await modal.getByRole("button", { name: "Close" }).click();
  await expect(modal).toBeHidden();
  expect(await routes()).not.toContain("dismiss");
});

test("a member reads it once: Got it dismisses it on every device", async ({
  page,
}) => {
  await armCapabilities(SPACES_OWNER_CAPS);
  await armChoice(memberChoice());
  await page.goto("/");
  const modal = choiceModal(page);
  await expect(modal).toContainText("Nothing to do on your side", {
    timeout: 15_000,
  });
  await expect(modal.getByRole("button", { name: "Maybe later" })).toHaveCount(
    0,
  );
  await modal.getByRole("button", { name: "Got it" }).click();
  await expect(modal).toBeHidden();
  await expect.poll(routes).toContain("dismiss");

  await page.reload();
  await expect(page.getByRole("main")).toBeVisible();
  await expect
    .poll(async () => (await routes()).filter((r) => r === "get").length)
    .toBe(2);
  await expect(choiceModal(page)).toBeHidden();
});

test("a failed Got it keeps the modal closed, and a later open retries", async ({
  page,
}) => {
  await armCapabilities(SPACES_OWNER_CAPS);
  await armChoice(memberChoice(), undefined, { failDismiss: true });
  await page.goto("/");
  const modal = choiceModal(page);
  await modal
    .getByRole("button", { name: "Got it" })
    .click({ timeout: 15_000 });
  await expect(modal).toBeHidden();
  await expect.poll(routes).toContain("dismiss");
  await page.clock.runFor(3_000);
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // Nothing was stored, so the next open shows it again.
  await page.reload();
  await expect(page.getByRole("dialog", { name: MODAL_TITLE })).toBeVisible({
    timeout: 15_000,
  });
});

test("a single-org owner reads that it stays free; the X dismisses it too", async ({
  page,
}) => {
  await armCapabilities(SPACES_OWNER_CAPS);
  await armChoice(singleOrgChoice());
  await page.goto("/");
  const modal = choiceModal(page);
  await expect(modal).toContainText("La Fila stays free", {
    timeout: 15_000,
  });
  await modal.getByRole("button", { name: "Close" }).click();
  await expect(modal).toBeHidden();
  await expect.poll(routes).toContain("dismiss");
});

test("it waits behind the paused-routines prompt, then follows it", async ({
  page,
}) => {
  await armCapabilities({ ...SPACES_OWNER_CAPS, plan: true });
  await armPlan({
    summary: freePlan({ routines: { ...FREE_ROUTINES, paused: true } }),
  });
  await armChoice(ownerChoice());
  await page.goto("/");

  const prompt = page
    .getByRole("dialog")
    .filter({ hasText: "Your routines were paused" });
  await expect(prompt).toBeVisible({ timeout: 15_000 });
  await expect.poll(routes).toContain("get");
  await page.clock.runFor(3_000);
  await expect(choiceModal(page)).toBeHidden();
  await expect(page.getByRole("dialog")).toHaveCount(1);

  await prompt.getByRole("button", { name: "Not now" }).last().click();
  await expect(prompt).toBeHidden();
  await expect(page.getByRole("dialog", { name: MODAL_TITLE })).toBeVisible();
});

test("off a spaces host there is no modal and no read", async ({ page }) => {
  await armChoice(ownerChoice());
  await page.goto("/");
  await expect(page.getByRole("main")).toBeVisible();
  await page.clock.runFor(3_000);
  await expect(choiceModal(page)).toBeHidden();
  expect(await choiceCalls()).toEqual([]);
});

test("a gateway without the route shows nothing", async ({ page }) => {
  await armCapabilities(SPACES_OWNER_CAPS);
  await page.goto("/");
  await expect(page.getByRole("main")).toBeVisible();
  await page.clock.runFor(3_000);
  await expect(choiceModal(page)).toBeHidden();
});
