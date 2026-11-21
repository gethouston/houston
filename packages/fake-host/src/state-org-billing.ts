import type { FreeOrg, OrgBilling, SeatPrices } from "@houston/wire-types";
import type { PlanSeed } from "./state-plan";

export const PERSONAL_ORG_SLUG = "ffffffffffffffff";

export const FAKE_SEAT_PRICES: SeatPrices = {
  monthlyCents: 2000,
  annualCents: 18000,
};

let yearlySold = true;

export function setYearlySold(sold: boolean): void {
  yearlySold = sold;
}

export function sellsYearlySeat(): boolean {
  return yearlySold;
}

export function servedBilling<T extends OrgBilling | null>(billing: T): T {
  if (!billing?.seatPrices || yearlySold) return billing;
  return {
    ...billing,
    seatPrices: { ...billing.seatPrices, annualCents: null },
  };
}

const WEEK_MS = 7 * 24 * 3_600_000;

export function planOrgBilling(seed: Required<PlanSeed>): OrgBilling {
  if (seed.personalBilling) return seed.personalBilling;
  const { summary } = seed;
  const free = summary.plan === "free";
  const routines = summary.routines;
  const kept = routines?.kept;
  return {
    tier: free ? "free" : "paid",
    status: summary.plus.status === "past_due" ? "past_due" : "active",
    lockAt: null,
    lockReason: null,
    freeSlot: free,
    isBillingOwner: true,
    seats: 1,
    interval: free ? null : "month",
    seatPriceCents: free
      ? FAKE_SEAT_PRICES.monthlyCents
      : summary.plus.price.amount,
    seatPrices: FAKE_SEAT_PRICES,
    seatGraceEndsAt: null,
    renewsAt: null,
    priceNotice: null,
    paidSeats: null,
    seatsInUse: null,
    usage:
      free && summary.usage
        ? {
            scope: "org",
            used: summary.usage.used,
            limit: summary.usage.limit,
            resetsAt:
              summary.usage.resetsAt ??
              seed.messageLimit?.resetsAt ??
              new Date(Date.now() + WEEK_MS).toISOString(),
          }
        : null,
    routines:
      free && routines
        ? {
            paused: routines.paused,
            kept: kept
              ? { agentSlug: kept.agentSlug, routineId: kept.routineId }
              : null,
            needsChoice: routines.needsChoice,
            limitedCount: routines.limitedCount,
            maxActive: routines.maxActive,
            minIntervalMinutes: routines.minIntervalMinutes,
          }
        : null,
  };
}

export function planFreeOrg(seed: Required<PlanSeed>): FreeOrg {
  if (seed.freeOrg) return seed.freeOrg;
  return seed.summary.plan === "free"
    ? { available: false, orgSlug: PERSONAL_ORG_SLUG }
    : { available: true, orgSlug: null };
}

export function freeOrgBilling(): OrgBilling {
  return {
    tier: "free",
    status: "active",
    lockAt: null,
    lockReason: null,
    freeSlot: true,
    isBillingOwner: true,
    seats: 1,
    interval: null,
    seatPriceCents: FAKE_SEAT_PRICES.monthlyCents,
    seatPrices: FAKE_SEAT_PRICES,
    seatGraceEndsAt: null,
    renewsAt: null,
    priceNotice: null,
    paidSeats: null,
    seatsInUse: null,
    usage: null,
    routines: null,
  };
}

export function unpaidOrgBilling(): OrgBilling {
  return {
    tier: "free",
    status: "locked",
    lockAt: new Date().toISOString(),
    lockReason: "unpaid",
    freeSlot: false,
    isBillingOwner: true,
    seats: 1,
    interval: null,
    seatPriceCents: FAKE_SEAT_PRICES.monthlyCents,
    seatPrices: FAKE_SEAT_PRICES,
    seatGraceEndsAt: null,
    renewsAt: null,
    priceNotice: null,
    paidSeats: null,
    seatsInUse: null,
    usage: null,
    routines: null,
  };
}
