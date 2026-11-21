import { readOrgSummary } from "./org-billing";
import type { SeatIntervalRefusal } from "./seat-prices";
import type { OrgSummary } from "./types";

export const ORG_PLANS = ["free", "paid"] as const;
export type OrgPlan = (typeof ORG_PLANS)[number];

export const FREE_ORG_TAKEN = "free_org_taken";

export type CreateOrgOutcome =
  | { kind: "created"; org: OrgSummary }
  | { kind: typeof FREE_ORG_TAKEN; freeOrgSlug: string }
  | { kind: "checkout"; org: OrgSummary; checkoutUrl: string }
  | { kind: SeatIntervalRefusal };

export function readCreatedOrg(raw: unknown): CreateOrgOutcome {
  const { checkoutUrl, ...org } = raw as { checkoutUrl?: unknown };
  const summary = readOrgSummary(org);
  return typeof checkoutUrl === "string" && checkoutUrl.length > 0
    ? { kind: "checkout", org: summary, checkoutUrl }
    : { kind: "created", org: summary };
}

export const CLAIM_FREE_REFUSALS = {
  has_subscription: 409,
  not_billing_owner: 403,
} as const;
export type ClaimFreeRefusal = keyof typeof CLAIM_FREE_REFUSALS;

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
