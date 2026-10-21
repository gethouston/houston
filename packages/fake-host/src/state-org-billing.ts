/**
 * Org billing as the fake gateway serves it on `GET /v1/orgs`: the armed
 * per-person plan projected onto the personal org, the free slot, and the
 * locked state a paid create starts in. The plan world itself is
 * `state-plan.ts`; this module only reads it.
 */

import type { FreeOrg, OrgBilling } from "@houston/wire-types";
import type { PlanSeed } from "./state-plan";

/**
 * The personal org the gateway lists beside the teams. The fake host's
 * personal space is the seed workspace, so this org exists only while the
 * plan is armed: it is where the person's billing lives. Its slug is outside
 * the range `mintTeamSlug` counts through, so no team ever collides with it.
 */
export const PERSONAL_ORG_SLUG = "ffffffffffffffff";

/** A pool with no stated reset resets a week from now. */
const WEEK_MS = 7 * 24 * 3_600_000;

/**
 * The armed summary as the gateway serves it on the personal org after the
 * move to org billing: Free is a free org with the person's pool and routine
 * rules, Plus a paid one. Computed per read, so a spec that re-arms or a
 * route that mutates the summary is seen on the next `GET /v1/orgs`.
 */
export function planOrgBilling(seed: Required<PlanSeed>): OrgBilling {
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
    seatPriceCents: summary.plus.price.amount,
    seatGraceEndsAt: null,
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
    seatPriceCents: 1500,
    seatGraceEndsAt: null,
    usage: null,
    routines: null,
  };
}
