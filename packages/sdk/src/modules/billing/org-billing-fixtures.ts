import type { OrgBilling, OrgRoutines } from "@houston/wire-types";

/** A free org's routine block with one routine kept and nothing to ask. */
export const FREE_ORG_ROUTINES: OrgRoutines = {
  paused: false,
  kept: null,
  needsChoice: false,
  limitedCount: 0,
  maxActive: 1,
  minIntervalMinutes: 15,
};

/** A free org mid-week whose billing owner is the caller. */
export function freeOrgBilling(patch: Partial<OrgBilling> = {}): OrgBilling {
  return {
    tier: "free",
    status: "active",
    lockAt: null,
    lockReason: null,
    freeSlot: true,
    isBillingOwner: true,
    seats: 3,
    interval: null,
    seatPriceCents: 2000,
    seatPrices: { monthlyCents: 2000, annualCents: 18000 },
    seatGraceEndsAt: null,
    usage: {
      scope: "org",
      used: 10,
      limit: 40,
      resetsAt: "2026-10-05T03:00:00Z",
    },
    routines: FREE_ORG_ROUTINES,
    ...patch,
  };
}

/** A paid, active org with no pool and no routine rules. */
export function paidOrgBilling(patch: Partial<OrgBilling> = {}): OrgBilling {
  return freeOrgBilling({
    tier: "paid",
    freeSlot: false,
    usage: null,
    routines: null,
    ...patch,
  });
}

/** A free org whose pool is at `used` of `limit`. */
export function withUsage(used: number, limit = 100): OrgBilling {
  return freeOrgBilling({
    usage: { scope: "org", used, limit, resetsAt: "2026-10-05T03:00:00Z" },
  });
}
