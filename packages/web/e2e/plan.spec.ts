import type { Page } from "@playwright/test";
import { NEW_TASK_PLACEHOLDER } from "./support/composer";
import { expect, test } from "./support/fixtures";
import { openNewMission } from "./support/mission";
import {
  armOrgPlan,
  armPlan,
  billingRow,
  CHECKOUT_URL,
  FREE_ROUTINES,
  freePlan,
  installPlanClock,
  openedUrls,
  openOrgBilling,
  orgBilling,
  PORTAL_URL,
  planCallCount,
  planCalls,
  planRoutine,
  plusPlan,
  stubOpener,
} from "./support/plan";
import { openSettings } from "./support/settings-nav";

/**
 * The org plan: Admin > Billing, the org checkout and portal, the weekly
 * pool's limit in chat and the routine prompts, against the fake host's armed
 * plan served as the Personal org's billing (`support/plan.ts`). Every gateway call is
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
    page.getByRole("button", { name: /^Keyboard shortcuts/ }).first(),
  ).toBeVisible();
  await expect(billingRow(page)).toHaveCount(0);
});

test("Admin > Billing on a free org: the share of the week and Upgrade", async ({
  page,
}) => {
  await armOrgPlan({ summary: freePlan() });
  await page.goto("/");
  const billing = await openOrgBilling(page);

  await expect(
    billing.getByRole("heading", { name: "Free tier", exact: true }),
  ).toBeVisible();
  await expect(billing.getByText("25% used")).toBeVisible();
  await expect(
    billing.getByRole("progressbar", { name: "25% used" }),
  ).toBeVisible();
  await expect(billing.getByText("$15 a month for 1 member")).toBeVisible();
  await expect(billing.getByRole("button", { name: "Upgrade" })).toBeEnabled();
  // The pool is a share of the week, never a message count.
  await expect(billing).not.toContainText(/\b10\b|\b40\b|messages/);
  await expect(
    billing.getByRole("button", { name: "Manage billing" }),
  ).toHaveCount(0);
});

test("Admin > Billing on a paid org: seats, the total and Manage billing", async ({
  page,
}) => {
  await stubOpener(page, false);
  await armOrgPlan({ summary: plusPlan(true) });
  await page.goto("/");
  const billing = await openOrgBilling(page);

  await expect(
    billing.getByRole("heading", { name: "Paid tier" }),
  ).toBeVisible();
  await expect(billing.getByText("1 seat, $15 a month")).toBeVisible();
  await expect(billing.getByTestId("billing-usage")).toHaveCount(0);
  await billing.getByRole("button", { name: "Manage billing" }).click();
  await expect.poll(() => planCallCount("portal")).toBe(1);
  await expect.poll(() => openedUrls(page)).toEqual([PORTAL_URL]);
});

test("checkout: Upgrade disables while the checkout is outstanding", async ({
  page,
}) => {
  await stubOpener(page, false);
  await armOrgPlan({ summary: freePlan() });
  await page.goto("/");
  const billing = await openOrgBilling(page);

  const upgrade = billing.getByRole("button", { name: "Upgrade" });
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
  await armOrgPlan({ summary: freePlan() });
  await page.goto("/");
  const billing = await openOrgBilling(page);

  await billing.getByRole("button", { name: "Upgrade" }).click();
  const fallback = billing.getByRole("link", { name: "Open checkout" });
  await expect(fallback).toBeVisible();
  await expect(fallback).toHaveAttribute("href", CHECKOUT_URL);
  await expect(billing.getByRole("button", { name: "Upgrade" })).toBeDisabled();
  expect(await planCallCount("checkout")).toBe(1);
});

test("a send refused with message_limit renders the limit card and is not retried", async ({
  page,
}) => {
  await armPlan({
    summary: freePlan({ usage: { percent: 50, used: 20, limit: 40 } }),
    messageLimit: { limit: 40, resetsAt: "2026-10-07T17:00:00.000Z" },
  });
  await page.goto("/");
  await openNewMission(page);
  const composer = page.getByPlaceholder(NEW_TASK_PLACEHOLDER);
  await composer.fill("draft the weekly report");
  await composer.press("Enter");

  await expect(page.getByText("Weekly usage limit reached")).toBeVisible();
  await expect(
    page.getByText(/^Your organization's free tier limit resets /),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Upgrade", exact: true }),
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
  await armOrgPlan({
    summary: freePlan({
      usage: {
        percent: 100,
        used: 40,
        limit: 40,
        resetsAt: "2026-10-07T17:00:00.000Z",
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
  await page.getByRole("button", { name: "Upgrade", exact: true }).click();
  await expect(orgBilling(page).getByTestId("billing-plan")).toBeVisible();
});

test("at 80% the composer shows the usage hint and the way to Billing", async ({
  page,
}) => {
  await armOrgPlan({
    summary: freePlan({ usage: { percent: 85, used: 34, limit: 40 } }),
  });
  await page.goto("/");
  await openNewMission(page);

  await expect(
    page.getByText(
      "Your organization has used 85% of this week's free tier limit.",
    ),
  ).toBeVisible();
  // The hint never blocks: the composer stays open.
  await expect(page.getByPlaceholder(NEW_TASK_PLACEHOLDER)).toBeEditable();
  await page.getByRole("button", { name: "Upgrade", exact: true }).click();
  await expect(orgBilling(page).getByTestId("billing-plan")).toBeVisible();
  expect(await planCallCount("checkout")).toBe(0);
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
