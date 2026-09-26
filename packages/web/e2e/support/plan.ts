import { FAKE_HOST_URL } from "@houston/fake-host";
import type {
  PlanRoutine,
  PlanSummary,
  PlusInvoice,
} from "@houston/wire-types";
import { expect, type Locator, type Page } from "@playwright/test";
import { openSettings } from "./settings-nav";
import { screen } from "./team-nav";

/**
 * The C19 personal plan, armed on the fake host (`/__test__/plan`), and the
 * Billing screen, the announcement and the Stripe opener it drives.
 *
 * Every instant is FIXED and the page clock starts at `PLAN_NOW`
 * (`installPlanClock`), so the launch copy ("starts Oct 1"), the early offer's
 * window and the preview-versus-enforced mode are a function of the fixture
 * alone, on any day the suite runs.
 */

/** The page's "now": six days before the limits start. */
export const PLAN_NOW = "2026-09-25T17:00:00.000Z";
/** `LimitsStartAt`, `EarlyPeriodEnd` and the offer's close (`- 32 min`). */
export const LIMITS_START_AT = "2026-10-01T07:00:00.000Z";
const EARLY_PERIOD_END = "2026-11-01T07:00:00.000Z";
const OFFER_ENDS_AT = "2026-10-01T06:28:00.000Z";
/** Where the fake host's checkout and portal point (never a real Stripe). */
export const CHECKOUT_URL = "https://checkout.houston.invalid/c/pay/e2e";
export const PORTAL_URL = "https://billing.houston.invalid/p/session/e2e";

/** Free's routine block with one routine kept and nothing to ask. */
export const FREE_ROUTINES: NonNullable<PlanSummary["routines"]> = {
  paused: false,
  maxActive: 1,
  minIntervalMinutes: 15,
  needsChoice: false,
  limitedCount: 0,
};

/** A Free person mid-week, with the launch discount and the early offer on. */
export function freePlan(patch: Partial<PlanSummary> = {}): PlanSummary {
  return {
    plan: "free",
    usage: { percent: 25, used: 10, limit: 40 },
    plus: {
      status: "none",
      manageable: false,
      price: {
        amount: 1500,
        currency: "usd",
        interval: "month",
        compareAt: 2000,
      },
      offer: {
        amount: 1000,
        currency: "usd",
        coversFrom: LIMITS_START_AT,
        coversUntil: EARLY_PERIOD_END,
        endsAt: OFFER_ENDS_AT,
      },
    },
    announcement: false,
    routines: FREE_ROUTINES,
    ...patch,
  };
}

/** A Plus person; `manageable` = the portal (Manage) works. */
export function plusPlan(manageable: boolean): PlanSummary {
  return {
    plan: "plus",
    plus: {
      status: "active",
      renewsAt: "2026-10-25T17:00:00.000Z",
      manageable,
      price: { amount: 1500, currency: "usd", interval: "month" },
    },
    announcement: false,
  };
}

export const PAID_INVOICE: PlusInvoice = {
  id: "in_e2e_1",
  number: "E2E-0001",
  createdAt: "2026-09-01T17:00:00.000Z",
  amount: 1500,
  currency: "usd",
  status: "paid",
  hostedUrl: "https://invoice.houston.invalid/i/e2e",
};

export function planRoutine(
  routineId: string,
  name: string,
  runsLast7d: number,
): PlanRoutine {
  return {
    orgSlug: "personal",
    orgName: "Personal",
    agentSlug: "writer",
    agentName: "Writer",
    routineId,
    name,
    kind: "schedule",
    schedule: "0 9 * * *",
    runsLast7d,
    kept: false,
  };
}

export interface PlanArming {
  summary: PlanSummary;
  invoices?: PlusInvoice[];
  routines?: PlanRoutine[];
  messageLimit?: { limit: number; resetsAt: string };
  /** A C19 refusal every Plus checkout answers instead of a session. */
  checkoutRefusal?: "account_deleted" | "not_configured";
}

/** Arm the plan (and its capability) before the page boots. */
export async function armPlan(arming: PlanArming): Promise<void> {
  const res = await fetch(`${FAKE_HOST_URL}/__test__/plan`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(arming),
  });
  expect(res.ok).toBe(true);
}

export type PlanCallRoute =
  | "plan"
  | "invoices"
  | "routines"
  | "checkout"
  | "portal"
  | "keep"
  | "resume"
  | "presence"
  | "announcement"
  | "send";

/** Every plan call the fake host served since arming, in order. */
export async function planCalls(): Promise<
  { route: PlanCallRoute; body?: unknown }[]
> {
  const res = await fetch(`${FAKE_HOST_URL}/__test__/plan-calls`);
  return ((await res.json()) as { calls: { route: PlanCallRoute }[] }).calls;
}

/** How many times one plan route was called. Poll it with `expect.poll`. */
export async function planCallCount(route: PlanCallRoute): Promise<number> {
  return (await planCalls()).filter((call) => call.route === route).length;
}

/** Start the page clock at `PLAN_NOW`; time then flows normally. */
export async function installPlanClock(page: Page): Promise<void> {
  await page.clock.install({ time: new Date(PLAN_NOW) });
}

/**
 * Stub `window.open` (the web build's `open_url`) with a ledger, so no spec
 * ever reaches a Stripe page: `blocked` models the popup blocker refusing
 * the open, which is what makes the app offer its fallback link.
 */
export async function stubOpener(page: Page, blocked: boolean): Promise<void> {
  await page.addInitScript((refuse: boolean) => {
    const opened: string[] = [];
    (window as unknown as { __opened: string[] }).__opened = opened;
    window.open = ((url?: string | URL) => {
      opened.push(String(url ?? ""));
      return refuse ? null : ({ opener: null } as unknown as Window);
    }) as typeof window.open;
  }, blocked);
}

export function openedUrls(page: Page): Promise<string[]> {
  return page.evaluate(
    () => (window as unknown as { __opened: string[] }).__opened,
  );
}

/** The Settings index's Billing row, by its title (the name folds in its description). */
export function billingRow(page: Page): Locator {
  return screen(page).getByRole("button", { name: /^Billing/ });
}

/** The Billing screen's body, once its plan has loaded. */
export function billingScreen(page: Page): Locator {
  return screen(page)
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Billing", level: 1 }) });
}

/** Open Settings > Billing on the desktop rail and wait for the plan card. */
export async function openBilling(page: Page): Promise<Locator> {
  await openSettings(page);
  await billingRow(page).click();
  const billing = billingScreen(page);
  await expect(
    billing.getByRole("heading", { level: 2 }).first(),
  ).toBeVisible();
  return billing;
}

/** The launch announcement, by its title (before or after the launch). */
export function announcementDialog(page: Page): Locator {
  return page.getByRole("dialog").filter({ hasText: /officially launch/ });
}
