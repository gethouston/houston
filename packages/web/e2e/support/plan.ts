import { FAKE_HOST_URL } from "@houston/fake-host";
import type {
  PlanRoutine,
  PlanSummary,
  PlusInvoice,
} from "@houston/wire-types";
import { expect, type Locator, type Page } from "@playwright/test";
import { openAdminSection, openSettings } from "./settings-nav";
import { screen } from "./team-nav";

export const PLAN_NOW = "2026-10-05T17:00:00.000Z";
export const CHECKOUT_URL = "https://checkout.houston.invalid/c/pay/e2e";
export const PORTAL_URL = "https://billing.houston.invalid/p/session/e2e";

export const FREE_ROUTINES: NonNullable<PlanSummary["routines"]> = {
  paused: false,
  maxActive: 1,
  minIntervalMinutes: 15,
  needsChoice: false,
  limitedCount: 0,
};

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
  checkoutRefusal?: "account_deleted" | "not_configured";
}

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
  | "send"
  | "org_free"
  | "switch_to_yearly"
  | "price_notice_dismiss";

export async function planCalls(): Promise<
  { route: PlanCallRoute; body?: unknown }[]
> {
  const res = await fetch(`${FAKE_HOST_URL}/__test__/plan-calls`);
  return ((await res.json()) as { calls: { route: PlanCallRoute }[] }).calls;
}

export async function stopSellingYearly(): Promise<void> {
  const res = await fetch(`${FAKE_HOST_URL}/__test__/yearly`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sold: false }),
  });
  if (!res.ok) throw new Error(`yearly switch answered ${res.status}`);
}

export async function planCallCount(route: PlanCallRoute): Promise<number> {
  return (await planCalls()).filter((call) => call.route === route).length;
}

export async function installPlanClock(page: Page): Promise<void> {
  await page.clock.install({ time: new Date(PLAN_NOW) });
}

export async function stubOpener(page: Page, blocked: boolean): Promise<void> {
  await page.addInitScript((refuse: boolean) => {
    const opened: string[] = [];
    (window as unknown as { __opened: string[] }).__opened = opened;
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

export function billingRow(page: Page): Locator {
  return screen(page).getByRole("button", { name: /^Billing/ });
}

export function billingScreen(page: Page): Locator {
  return screen(page)
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Billing", level: 1 }) });
}

export async function openBilling(page: Page): Promise<Locator> {
  await openSettings(page);
  await billingRow(page).click();
  const billing = billingScreen(page);
  await expect(
    billing.getByRole("heading", { level: 2 }).first(),
  ).toBeVisible();
  return billing;
}

export function orgBilling(page: Page): Locator {
  return screen(page).locator("[data-admin-section-body='billing']");
}

export async function armOrgPlan(arming: PlanArming): Promise<void> {
  await armPlan(arming);
  const res = await fetch(`${FAKE_HOST_URL}/__test__/capabilities`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ spaces: true }),
  });
  expect(res.ok).toBe(true);
}

export async function openOrgBilling(page: Page): Promise<Locator> {
  await openAdminSection(page, "Billing");
  const billing = orgBilling(page);
  await expect(billing.getByTestId("billing-plan")).toBeVisible();
  return billing;
}
