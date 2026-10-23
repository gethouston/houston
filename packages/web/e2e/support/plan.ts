import { FAKE_HOST_URL } from "@houston/fake-host";
import type {
  PlanRoutine,
  PlanSummary,
  PlusInvoice,
} from "@houston/wire-types";
import { expect, type Locator, type Page } from "@playwright/test";
import { openAdminSection, openSettings } from "./settings-nav";
import { screen } from "./team-nav";

/**
 * The plan, armed on the fake host (`/__test__/plan`) and served as the
 * Personal org's billing, and the Billing screens and the Stripe opener it
 * drives.
 *
 * Every instant is FIXED and the page clock starts at `PLAN_NOW`
 * (`installPlanClock`), so every date on screen is a function of the fixture
 * alone, on any day the suite runs.
 */

/** The page's "now": after the launch, so the summary carries no `limitsStartAt`. */
export const PLAN_NOW = "2026-10-05T17:00:00.000Z";
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

/** A Free person mid-week, with the launch discount and the beta tester gift. */
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
      offer: { amount: 1000, currency: "usd" },
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

/**
 * Stop the fake gateway selling a yearly seat, as when its yearly price is
 * unset: the orgs list drops the yearly price and a yearly checkout or paid
 * create answers 409 `interval_unavailable`. Reset sells it again.
 */
export async function stopSellingYearly(): Promise<void> {
  const res = await fetch(`${FAKE_HOST_URL}/__test__/yearly`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sold: false }),
  });
  if (!res.ok) throw new Error(`yearly switch answered ${res.status}`);
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
    // A tab claimed empty inside a click (`reserveBrowserTab`) records the
    // URL it is pointed at later, so both opens read the same.
    const tab = {
      opener: null,
      closed: false,
      close: () => {},
      location: {
        set href(url: string) {
          opened.push(url);
        },
      },
    };
    window.open = ((url?: string | URL) => {
      if (refuse) {
        opened.push(String(url ?? ""));
        return null;
      }
      if (url) opened.push(String(url));
      return tab as unknown as Window;
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

/** Settings > Billing's body: the free-org pick and the way to org billing. */
export function billingScreen(page: Page): Locator {
  return screen(page)
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Billing", level: 1 }) });
}

/** Open Settings > Billing on the desktop rail and wait for its first card. */
export async function openBilling(page: Page): Promise<Locator> {
  await openSettings(page);
  await billingRow(page).click();
  const billing = billingScreen(page);
  await expect(
    billing.getByRole("heading", { level: 2 }).first(),
  ).toBeVisible();
  return billing;
}

/** Admin > Billing's body: the org's plan card and, on a free org, its pool. */
export function orgBilling(page: Page): Locator {
  return screen(page).locator("[data-admin-section-body='billing']");
}

/**
 * Arm the plan as the Personal org's billing on a cloud host: the plan seed
 * plus `spaces`, which is what puts Billing in Admin.
 */
export async function armOrgPlan(arming: PlanArming): Promise<void> {
  await armPlan(arming);
  const res = await fetch(`${FAKE_HOST_URL}/__test__/capabilities`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ spaces: true }),
  });
  expect(res.ok).toBe(true);
}

/** Open Admin > Billing and wait for the org's plan card. */
export async function openOrgBilling(page: Page): Promise<Locator> {
  await openAdminSection(page, "Billing");
  const billing = orgBilling(page);
  await expect(billing.getByTestId("billing-plan")).toBeVisible();
  return billing;
}
