import { readOrgSummary } from "./org-billing";
import type { SeatIntervalRefusal } from "./seat-prices";
import type { OrgSummary } from "./types";

/**
 * Creating an org and what a locked one lets the caller do: the plan a create
 * asks for, what the create answers, the free-slot swap's refusals, and the
 * recovery actions.
 */

/** The plan `POST /v1/orgs` asks for. Every new client sends one. */
export const ORG_PLANS = ["free", "paid"] as const;
export type OrgPlan = (typeof ORG_PLANS)[number];

/** The 409 a free create answers while the caller's free slot is taken. */
export const FREE_ORG_TAKEN = "free_org_taken";

/**
 * What a create answered: the org, the free slot already held by another org
 * (nothing was created), a paid org that stays locked until its checkout
 * completes, or a paid create whose interval the gateway refused (nothing was
 * created). A paid create's 201 is the org summary with `checkoutUrl` beside
 * it, which an older client reads as a plain summary.
 */
export type CreateOrgOutcome =
  | { kind: "created"; org: OrgSummary }
  | { kind: typeof FREE_ORG_TAKEN; freeOrgSlug: string }
  | { kind: "checkout"; org: OrgSummary; checkoutUrl: string }
  | { kind: SeatIntervalRefusal };

/** Read a 201 from `POST /v1/orgs`. */
export function readCreatedOrg(raw: unknown): CreateOrgOutcome {
  const { checkoutUrl, ...org } = raw as { checkoutUrl?: unknown };
  const summary = readOrgSummary(org);
  return typeof checkoutUrl === "string" && checkoutUrl.length > 0
    ? { kind: "checkout", org: summary, checkoutUrl }
    : { kind: "created", org: summary };
}

/**
 * The refusals `POST /v1/org/billing/free` (the free-slot swap) answers for a
 * state the caller is in, with their status: the org still has a live
 * subscription, or the caller is not the one who pays.
 */
export const CLAIM_FREE_REFUSALS = {
  has_subscription: 409,
  not_billing_owner: 403,
} as const;
export type ClaimFreeRefusal = keyof typeof CLAIM_FREE_REFUSALS;

/** What a locked or locking org lets the caller do about it. */
export const ORG_RECOVERY_ACTIONS = [
  "checkout",
  "portal",
  "change_pick",
  "claim_free",
  "delete",
  "move_out",
  "ask_owner",
] as const;
export type OrgRecoveryAction = (typeof ORG_RECOVERY_ACTIONS)[number];
