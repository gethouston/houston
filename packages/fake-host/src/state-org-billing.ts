/**
 * Org billing as the fake gateway serves it on `GET /v1/orgs`: the armed
 * per-person plan projected onto the personal org, the free slot, and the
 * locked state a paid create starts in. The plan world itself is
 * `state-plan.ts`; this module only reads it.
 */

import type { FreeOrg, OrgBilling, SeatPrices } from "@houston/wire-types";
import type { PlanSeed } from "./state-plan";

/**
 * The personal org the gateway lists beside the teams. The fake host's
 * personal space is the seed workspace, so this org exists only while the
 * plan is armed: it is where the person's billing lives. Its slug is outside
 * the range `mintTeamSlug` counts through, so no team ever collides with it.
 */
export const PERSONAL_ORG_SLUG = "ffffffffffffffff";

/**
 * A new checkout's list prices in the fake world: a seat a month, or a year
 * of it on the yearly price, as the gateway sells them with both prices set.
 */
export const FAKE_SEAT_PRICES: SeatPrices = {
  monthlyCents: 2000,
  annualCents: 18000,
};

/**
 * Whether the fake gateway sells a yearly seat (`GW_STRIPE_TEAM_PRICE_ANNUAL`
 * set). A spec turns it off (`/__test__/yearly`) to reach the refusal: the
 * orgs list then drops the yearly price and a yearly checkout answers 409
 * `interval_unavailable`. Reset sells it again.
 */
let yearlySold = true;

export function setYearlySold(sold: boolean): void {
  yearlySold = sold;
}

export function sellsYearlySeat(): boolean {
  return yearlySold;
}

/** An org's billing as the list serves it: no yearly price while none sells. */
export function servedBilling<T extends OrgBilling | null>(billing: T): T {
  if (!billing?.seatPrices || yearlySold) return billing;
  return {
    ...billing,
    seatPrices: { ...billing.seatPrices, annualCents: null },
  };
}

/** A pool with no stated reset resets a week from now. */
const WEEK_MS = 7 * 24 * 3_600_000;

/**
 * The armed summary as the gateway serves it on the personal org after the
 * move to org billing: Free is a free org with the person's pool and routine
 * rules, Plus a paid one, unless a spec armed the org's billing whole.
 * Computed per read, so a spec that re-arms or a
 * route that mutates the summary is seen on the next `GET /v1/orgs`.
 */
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
    // A Plus payer moved to org billing keeps their monthly Plus price.
    interval: free ? null : "month",
    seatPriceCents: free
      ? FAKE_SEAT_PRICES.monthlyCents
      : summary.plus.price.amount,
    seatPrices: FAKE_SEAT_PRICES,
    seatGraceEndsAt: null,
    renewsAt: null,
    priceNotice: null,
    nextAdjustment: null,
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

/** The free slot the armed world reports: armed, else the personal org's. */
export function planFreeOrg(seed: Required<PlanSeed>): FreeOrg {
  if (seed.freeOrg) return seed.freeOrg;
  return seed.summary.plan === "free"
    ? { available: false, orgSlug: PERSONAL_ORG_SLUG }
    : { available: true, orgSlug: null };
}

/** A free create's org while the slot was open: it now holds the slot. */
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
    nextAdjustment: null,
    usage: null,
    routines: null,
  };
}

/** A paid create's org: locked, unpaid, until its checkout completes. */
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
    nextAdjustment: null,
    usage: null,
    routines: null,
  };
}
