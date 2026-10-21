import type { Locator } from "@playwright/test";
import {
  armCapabilities,
  choiceCalls,
  choiceModal,
  INNOVA,
  LA_FILA,
  PERSONAL,
  SPACES_OWNER_CAPS,
} from "./support/billing-choice";
import { expect, test } from "./support/fixtures";
import {
  armApplied,
  collectErrorReports,
  installAfterCutoverClock,
  pickedNonPayer,
  provisionalPayer,
  WINDOW_CLOSED,
} from "./support/pick-confirm";

/**
 * The pick after the cutover applied it. An owner the cutover picked for sees
 * what it chose over a working shell and confirms or changes it until the
 * change window ends; an owner who picked reads once that it applied.
 */

test.beforeEach(async ({ page }) => {
  await installAfterCutoverClock(page);
  await armCapabilities(SPACES_OWNER_CAPS);
});

const APPLIED = "We kept Personal free and moved your subscription to Acme";
const routes = async () => (await choiceCalls()).map((call) => call.route);
const row = (frame: Locator, name: string) =>
  frame.getByRole("listitem").filter({ hasText: name });

test("a provisional payer sees what the cutover picked over a working shell, and Confirm settles it", async ({
  page,
}) => {
  await armApplied(provisionalPayer());
  await page.goto("/");

  const modal = choiceModal(page);
  await expect(page.getByRole("dialog", { name: APPLIED })).toBeVisible({
    timeout: 15_000,
  });
  // The shell renders behind it (the dialog hides it from the a11y tree).
  await expect(page.locator("main")).toBeAttached();
  await expect(modal).toContainText(
    "We went by where you're most active. You can change this until November 6.",
  );
  await expect(modal.getByRole("listitem")).toHaveText([
    "ACAcme2 members · 520 messages in the last 30 daysYour subscription",
    "PEPersonal1 member · 240 messages in the last 30 daysFree",
    "LFLa Fila3 members · 96 messages in the last 30 daysLocks November 6",
  ]);
  await expect(modal).toContainText(
    "A locked organization keeps its agents and files, read-only, until it has a plan.",
  );

  await modal.getByRole("button", { name: "Confirm" }).click();
  await expect(modal).toBeHidden();
  expect((await choiceCalls()).filter((c) => c.route !== "get")).toEqual([
    {
      route: "set",
      body: { freeOrgSlug: PERSONAL.slug, paidOrgSlug: "4444444444444444" },
    },
    { route: "dismiss" },
  ]);

  await page.reload();
  await expect(page.getByRole("main")).toBeVisible();
  await expect
    .poll(async () => (await routes()).filter((r) => r === "get").length)
    .toBe(2);
  await expect(choiceModal(page)).toBeHidden();
});

test("Change moves the subscription to a three-member team and shows each org's lock date", async ({
  page,
}) => {
  await armApplied(provisionalPayer());
  await page.goto("/");
  const modal = choiceModal(page);
  await modal.getByRole("button", { name: "Change" }).click({
    timeout: 15_000,
  });

  // The picker starts on what the cutover applied.
  await expect(modal.getByRole("radio", { name: /Personal/ })).toBeChecked();
  await modal.getByRole("button", { name: "Next" }).click();
  await expect(modal.getByRole("radio", { name: /Acme/ })).toBeChecked();
  await modal.getByText("La Fila", { exact: true }).click();
  await expect(modal).toContainText(
    "Your price stays $15 a month until November 22, then it's $45 a month.",
  );
  await modal.getByRole("button", { name: "Pay for La Fila" }).click();

  await expect(
    page.getByRole("dialog", {
      name: "Personal is your free organization now",
    }),
  ).toBeVisible();
  await expect(modal).toContainText("Your subscription now pays for La Fila.");
  await expect(row(modal, "Personal")).toContainText("Free");
  await expect(row(modal, "La Fila")).toContainText("Your subscription");
  await expect(row(modal, "Acme")).toContainText("Locks November 6");
  await expect(modal).toContainText(
    "You can change this in Settings until November 6.",
  );
  expect((await choiceCalls()).filter((c) => c.route === "set")).toEqual([
    {
      route: "set",
      body: { freeOrgSlug: PERSONAL.slug, paidOrgSlug: LA_FILA.slug },
    },
  ]);
  await page.clock.runFor(3_000);
  await expect(modal).toBeVisible();

  await modal.getByRole("button", { name: "Done" }).click();
  await expect(modal).toBeHidden();
  await expect.poll(routes).toContain("dismiss");
});

test("Maybe later hides it for the session; the next open asks again", async ({
  page,
}) => {
  await armApplied(provisionalPayer());
  await page.goto("/");
  const modal = choiceModal(page);
  await modal
    .getByRole("button", { name: "Maybe later" })
    .click({ timeout: 15_000 });
  await expect(modal).toBeHidden();
  expect(await routes()).not.toContain("dismiss");

  await page.reload();
  await expect(page.getByRole("dialog", { name: APPLIED })).toBeVisible({
    timeout: 15_000,
  });
});

test("a non-payer who picked reads only the note, and Got it dismisses it", async ({
  page,
}) => {
  await armApplied(pickedNonPayer());
  await page.goto("/");
  const modal = choiceModal(page);
  await expect(
    page.getByRole("dialog", { name: "Innova is your free organization now" }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(modal).toContainText("Here's how your organizations look now.");
  await expect(row(modal, INNOVA.name)).toContainText("Free");
  await expect(row(modal, LA_FILA.name)).toContainText("Locks November 6");
  await expect(modal).toContainText(
    "You can change this in Settings until November 6.",
  );
  await expect(modal.getByRole("button", { name: "Confirm" })).toHaveCount(0);
  await expect(modal.getByRole("button", { name: "Change" })).toHaveCount(0);

  await modal.getByRole("button", { name: "Got it" }).click();
  await expect(modal).toBeHidden();
  await expect.poll(routes).toContain("dismiss");
  expect(await routes()).not.toContain("set");
});

test("a closed window answers Confirm with its own copy and no error report", async ({
  page,
}) => {
  const reports = collectErrorReports(page);
  // The page still thinks the window is open; the gateway knows it closed.
  await armApplied(provisionalPayer(), WINDOW_CLOSED);
  await page.goto("/");
  const modal = choiceModal(page);
  await modal
    .getByRole("button", { name: "Confirm" })
    .click({ timeout: 15_000 });
  await expect(page.getByText("The change window has closed")).toBeVisible();
  expect(await routes()).not.toContain("dismiss");
  expect(reports).toEqual([]);
});
