import type { OrgBilling, OrgRoutines } from "@houston/wire-types";

export const FREE_ORG_ROUTINES: OrgRoutines = {
  paused: false,
  kept: null,
  needsChoice: false,
  limitedCount: 0,
  maxActive: 1,
  minIntervalMinutes: 15,
};

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
    renewsAt: null,
    priceNotice: null,
    paidSeats: null,
    seatsInUse: null,
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

export function paidOrgBilling(patch: Partial<OrgBilling> = {}): OrgBilling {
  return freeOrgBilling({
    tier: "paid",
    freeSlot: false,
    usage: null,
    routines: null,
    ...patch,
  });
}

export function withUsage(used: number, limit = 100): OrgBilling {
  return freeOrgBilling({
    usage: { scope: "org", used, limit, resetsAt: "2026-10-05T03:00:00Z" },
  });
}
