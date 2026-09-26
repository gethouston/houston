import type { Page } from "@playwright/test";
import { NEW_TASK_PLACEHOLDER } from "./support/composer";
import { expect, test } from "./support/fixtures";
import { openNewMission } from "./support/mission";
import {
  announcementDialog,
  armPlan,
  billingRow,
  CHECKOUT_URL,
  FREE_ROUTINES,
  freePlan,
  installPlanClock,
  LIMITS_START_AT,
  openBilling,
  openedUrls,
  PAID_INVOICE,
  PORTAL_URL,
  planCallCount,
  planCalls,
  planRoutine,
  plusPlan,
  stubOpener,
} from "./support/plan";
import { openSettings } from "./support/settings-nav";

/**
 * C19 personal plan: the Billing screen, the Plus checkout, the weekly message
 * limit in chat, the routine prompts and the one-time launch announcement,
 * against the fake host's armed plan (`support/plan.ts`). Every gateway call is
 * read back from the host's ledger, so "called exactly once" is the wire's
 * word, not the UI's.
 */

test.beforeEach(async ({ page }) => {
  await installPlanClock(page);
});

/** No plan surface ever promises what Plus does not sell. */
async function expectNoUnlimited(page: Page): Promise<void> {
  await expect(page.locator("body")).not.toContainText(/unlimited/i);
}

test("without the plan capability there is no Billing row", async ({
  page,
}) => {
  await page.goto("/");
  await openSettings(page);
  await expect(
    page.getByRole("button", { name: /^About me/ }).first(),
  ).toBeVisible();
  await expect(billingRow(page)).toHaveCount(0);
});

test("Billing on Free: usage, the struck launch price and the early offer", async ({
  page,
}) => {
  await armPlan({ summary: freePlan() });
  await page.goto("/");
  const billing = await openBilling(page);

  await expect(billing.getByText("Free plan")).toBeVisible();
  await expect(billing.getByText("25% of your weekly usage")).toBeVisible();
  await expect(
    billing.getByRole("progressbar", { name: "25% of your weekly usage" }),
  ).toBeVisible();
  await expect(
    billing.getByRole("heading", { name: "Upgrade to Plus" }),
  ).toBeVisible();
  // The compare-at price is struck through beside its label; the real price
  // stays readable.
  await expect(billing.locator(".line-through")).toHaveText("$20");
  await expect(billing.getByText("Launch discount")).toBeVisible();
  await expect(
    billing.getByText("$15 per month", { exact: true }),
  ).toBeVisible();
  await expect(
    billing.getByText(
      "Upgrade before Oct 1, 2026: $10 today covers Oct 1, 2026 to Nov 1, 2026, then $15 per month",
    ),
  ).toBeVisible();
  await expect(billing.getByText("Offer ends Sep 30, 2026")).toBeVisible();
  await expect(
    billing.getByRole("button", { name: "Get Plus for $10" }),
  ).toBeEnabled();
  // Free has no Stripe customer: nothing to manage.
  await expect(billing.getByRole("button", { name: "Manage" })).toHaveCount(0);
  await expect(billing.getByText("No invoices yet")).toBeVisible();
  await expectNoUnlimited(page);
});

test("Billing on Plus: Manage opens the portal only when it is manageable", async ({
  page,
}) => {
  await stubOpener(page, false);
  await armPlan({ summary: plusPlan(true), invoices: [PAID_INVOICE] });
  await page.goto("/");
  const billing = await openBilling(page);

  await expect(billing.getByRole("heading", { name: "Plus" })).toBeVisible();
  await expect(billing.getByText("Renews Oct 25, 2026")).toBeVisible();
  await expect(
    billing.getByRole("heading", { name: "Upgrade to Plus" }),
  ).toHaveCount(0);
  await expect(billing.getByText("Paid")).toBeVisible();
  await billing.getByRole("button", { name: "Manage" }).click();
  await expect.poll(() => planCallCount("portal")).toBe(1);
  await expect.poll(() => openedUrls(page)).toEqual([PORTAL_URL]);
  await expectNoUnlimited(page);
});

test("Billing on an operator-granted Plus has no Manage", async ({ page }) => {
  await armPlan({ summary: plusPlan(false) });
  await page.goto("/");
  const billing = await openBilling(page);

  await expect(billing.getByRole("heading", { name: "Plus" })).toBeVisible();
  await expect(billing.getByRole("button", { name: "Manage" })).toHaveCount(0);
});

test("checkout: the button disables while the checkout is outstanding", async ({
  page,
}) => {
  await stubOpener(page, false);
  await armPlan({ summary: freePlan() });
  await page.goto("/");
  const billing = await openBilling(page);

  const upgrade = billing.getByRole("button", { name: "Get Plus for $10" });
  await upgrade.click();
  await expect(upgrade).toBeDisabled();
  await expect.poll(() => openedUrls(page)).toEqual([CHECKOUT_URL]);
  expect(await planCallCount("checkout")).toBe(1);
  // The browser took the page: no fallback link to offer.
  await expect(
    billing.getByRole("link", { name: "Open checkout" }),
  ).toHaveCount(0);
});

test("checkout: a refused opener offers the checkout as a link", async ({
  page,
}) => {
  await stubOpener(page, true);
  await armPlan({ summary: freePlan() });
  await page.goto("/");
  const billing = await openBilling(page);

  await billing.getByRole("button", { name: "Get Plus for $10" }).click();
  const fallback = billing.getByRole("link", { name: "Open checkout" });
  await expect(fallback).toBeVisible();
  await expect(fallback).toHaveAttribute("href", CHECKOUT_URL);
  await expect(
    billing.getByRole("button", { name: "Get Plus for $10" }),
  ).toBeDisabled();
  expect(await planCallCount("checkout")).toBe(1);
});

for (const { refusal, title } of [
  { refusal: "account_deleted", title: "Your account is being deleted" },
  { refusal: "not_configured", title: "Plus isn't available" },
] as const) {
  test(`checkout: a ${refusal} refusal explains itself, never as a bug`, async ({
    page,
  }) => {
    await stubOpener(page, false);
    await armPlan({ summary: freePlan(), checkoutRefusal: refusal });
    await page.goto("/");
    const billing = await openBilling(page);

    const upgrade = billing.getByRole("button", { name: "Get Plus for $10" });
    await upgrade.click();
    // The calm `status` channel, never the `alert` one a bug would take.
    await expect(
      page.getByRole("status").filter({ hasText: title }),
    ).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(page.getByText("Houston, we have a problem!")).toHaveCount(0);
    await expect.poll(() => planCallCount("checkout")).toBe(1);
    expect(await openedUrls(page)).toEqual([]);
    // Nothing is outstanding, so the trigger is usable again.
    await expect(upgrade).toBeEnabled();
  });
}

test("a send refused with message_limit renders the limit card and is not retried", async ({
  page,
}) => {
  await armPlan({
    summary: freePlan({ usage: { percent: 50, used: 20, limit: 40 } }),
    messageLimit: { limit: 40, resetsAt: "2026-09-27T17:00:00.000Z" },
  });
  await page.goto("/");
  await openNewMission(page);
  const composer = page.getByPlaceholder(NEW_TASK_PLACEHOLDER);
  await composer.fill("draft the weekly report");
  await composer.press("Enter");

  await expect(page.getByText("Weekly usage limit reached")).toBeVisible();
  await expect(page.getByText(/^Your usage resets /)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Upgrade to Plus" }),
  ).toBeVisible();
  // The typed card, never the gateway's raw refusal text.
  await expect(page.getByText("message limit reached")).toHaveCount(0);
  await expect(page.getByText(/message_limit/)).toHaveCount(0);
  // A plan state is never retried: run every timer a backoff could arm.
  await page.clock.runFor(60_000);
  expect(await planCallCount("send")).toBe(1);
  await expectNoUnlimited(page);
});

test("at the enforced limit the composer is replaced by the limit card", async ({
  page,
}) => {
  await armPlan({
    summary: freePlan({
      usage: {
        percent: 100,
        used: 40,
        limit: 40,
        resetsAt: "2026-09-27T17:00:00.000Z",
      },
    }),
  });
  await page.goto("/");
  // Not `openNewMission`: it waits for the composer this state replaces.
  await page
    .locator("[data-screen-active='true']")
    .locator('[data-tour-target="newMission"]')
    .first()
    .click();

  await expect(page.getByText("Weekly usage limit reached")).toBeVisible();
  await expect(page.getByPlaceholder(NEW_TASK_PLACEHOLDER)).toHaveCount(0);
  await page.getByRole("button", { name: "Upgrade to Plus" }).click();
  await expect(
    page.getByRole("heading", { name: "Billing", level: 1 }),
  ).toBeVisible();
});

test("at 80% of the preview week the composer shows the usage hint", async ({
  page,
}) => {
  await stubOpener(page, false);
  await armPlan({
    summary: freePlan({
      usage: { percent: 85, used: 34, limit: 40 },
      limitsStartAt: LIMITS_START_AT,
    }),
  });
  await page.goto("/");
  await openNewMission(page);

  await expect(
    page.getByText(
      "You're at 85% of the weekly usage that starts Oct 1, 2026.",
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Upgrade before Oct 1, 2026 and get your first month for $10.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Get Plus for $10" }).click();
  await expect.poll(() => planCallCount("checkout")).toBe(1);
  // The preview never blocks: the composer stays open.
  await expect(page.getByPlaceholder(NEW_TASK_PLACEHOLDER)).toBeEditable();
  await expectNoUnlimited(page);
});

test("paused routines: Resume posts once and closes the prompt", async ({
  page,
}) => {
  await armPlan({
    summary: freePlan({ routines: { ...FREE_ROUTINES, paused: true } }),
  });
  await page.goto("/");

  const dialog = page
    .getByRole("dialog")
    .filter({ hasText: "Your routines were paused" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Resume" }).click();
  await expect(dialog).toBeHidden();
  expect(await planCallCount("resume")).toBe(1);
});

test("too many routines: the keep picker saves the chosen routine", async ({
  page,
}) => {
  await armPlan({
    summary: freePlan({
      routines: { ...FREE_ROUTINES, needsChoice: true, limitedCount: 1 },
    }),
    routines: [
      planRoutine("routine-1", "Morning digest", 5),
      planRoutine("routine-2", "Invoice chaser", 2),
    ],
  });
  await page.goto("/");

  const dialog = page
    .getByRole("dialog")
    .filter({ hasText: "Choose a routine to keep running" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Morning digest")).toBeVisible();
  await dialog
    .locator("div")
    .filter({ hasText: /^Invoice chaser/ })
    .getByRole("button", { name: "Keep this one" })
    .click();
  await expect(dialog).toBeHidden();
  const keeps = (await planCalls()).filter((call) => call.route === "keep");
  expect(keeps).toEqual([
    {
      route: "keep",
      body: {
        orgSlug: "personal",
        agentSlug: "writer",
        routineId: "routine-2",
      },
    },
  ]);
});

test("presence is posted on foreground, at most once per ten minutes", async ({
  page,
}) => {
  await armPlan({ summary: freePlan() });
  await page.goto("/");
  await expect.poll(() => planCallCount("presence")).toBe(1);

  const foreground = () =>
    page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await foreground();
  await page.clock.runFor(1_000);
  expect(await planCallCount("presence")).toBe(1);

  await page.clock.fastForward("10:01");
  await foreground();
  await expect.poll(() => planCallCount("presence")).toBe(2);
});

for (const close of ["Maybe later", "the X", "Escape"] as const) {
  test(`the launch announcement closes with ${close}, dismissed exactly once`, async ({
    page,
  }) => {
    await stubOpener(page, false);
    await armPlan({
      summary: freePlan({ announcement: true, limitsStartAt: LIMITS_START_AT }),
    });
    await page.goto("/");

    const dialog = announcementDialog(page);
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("heading", {
        name: "Houston officially launches on October 1",
      }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Get my first month for $10" }),
    ).toBeVisible();
    await expectNoUnlimited(page);

    if (close === "Maybe later")
      await dialog
        .locator('button:not([data-slot="dialog-close"])', {
          hasText: "Maybe later",
        })
        .click();
    else if (close === "the X")
      await dialog.locator('[data-slot="dialog-close"]').click();
    else await page.keyboard.press("Escape");

    await expect(dialog).toBeHidden();
    await expect.poll(() => planCallCount("announcement")).toBe(1);

    // It never comes back: not in this session, not after a reload.
    await page.reload();
    await expect.poll(() => planCallCount("plan")).toBeGreaterThan(1);
    await expect(
      page.locator('[data-tour-target="nav-settings"]'),
    ).toBeVisible();
    await expect(announcementDialog(page)).toHaveCount(0);
    expect(await planCallCount("announcement")).toBe(1);
  });
}
