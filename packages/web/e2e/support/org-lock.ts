import { FAKE_HOST_URL } from "@houston/fake-host";
import type {
  FreeOrg,
  OrgBilling,
  OrgRole,
  PlanSummary,
} from "@houston/wire-types";
import { expect, type Locator, type Page } from "@playwright/test";
import { freePlan, installPlanClock } from "./plan";

export const TEAM = { slug: "00000000000000ab", name: "Acme" } as const;
export const SCHEDULED_LOCK = "2026-10-19T17:00:00.000Z";
const PAST_LOCK = "2026-10-01T17:00:00.000Z";

export function orgBilling(patch: Partial<OrgBilling> = {}): OrgBilling {
  return {
    tier: "free",
    status: "active",
    lockAt: null,
    lockReason: null,
    freeSlot: false,
    isBillingOwner: true,
    seats: 3,
    interval: null,
    seatPriceCents: 2000,
    seatPrices: { monthlyCents: 2000, annualCents: 18000 },
    seatGraceEndsAt: null,
    renewsAt: null,
    priceNotice: null,
    paidSeats: null,
    seatsInUse: null,
    usage: null,
    routines: null,
    ...patch,
  };
}

export const LOCKED = orgBilling({
  status: "locked",
  lockAt: PAST_LOCK,
  lockReason: "migration",
});
export const SCHEDULED = orgBilling({
  lockAt: SCHEDULED_LOCK,
  lockReason: "migration",
});
export const PAST_DUE = orgBilling({
  tier: "paid",
  status: "past_due",
  lockAt: SCHEDULED_LOCK,
  lockReason: "payment_failed",
});

export interface OrgLockArming {
  team: OrgBilling;
  role?: OrgRole;
  summary?: PlanSummary;
  personalBilling?: OrgBilling;
  freeOrg?: FreeOrg;
  caps?: Record<string, unknown>;
}

async function post(path: string, data: unknown): Promise<void> {
  const res = await fetch(`${FAKE_HOST_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  });
  expect(res.ok).toBe(true);
}

export async function setTeamBilling(
  billing: OrgBilling,
  role: OrgRole = "owner",
): Promise<void> {
  await post("/__test__/workspaces", {
    teams: [{ ...TEAM, billing, role, memberCount: 3 }],
  });
}

export async function armOrgLock(
  page: Page,
  arming: OrgLockArming,
): Promise<void> {
  const role = arming.role ?? "owner";
  await installPlanClock(page);
  await post("/__test__/capabilities", {
    multiplayer: true,
    teams: true,
    spaces: true,
    role,
    ...arming.caps,
  });
  await post("/__test__/plan", {
    summary: arming.summary ?? freePlan(),
    ...(arming.personalBilling
      ? { personalBilling: arming.personalBilling }
      : {}),
    ...(arming.freeOrg ? { freeOrg: arming.freeOrg } : {}),
  });
  await setTeamBilling(arming.team, role);
  await page.addInitScript((id: string) => {
    localStorage.setItem("houston.pref.last_workspace_id", id);
  }, `org:${TEAM.slug}`);
}

export function statusBanner(page: Page): Locator {
  return page.getByTestId("team-status-banner");
}
