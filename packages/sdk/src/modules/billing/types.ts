import {
  BILLING_INTERVALS,
  type BillingChoicePick,
  type BillingInterval,
  type PlanRoutineKey,
} from "@houston/wire-types";
import { field, requireString } from "../payload";

/** The write vocabulary — the same handlers back the facade and `dispatch`. */
export const BillingCommand = {
  Get: "billing/get",
  CreateCheckout: "billing/createCheckout",
  CreatePortal: "billing/createPortal",
  GetChoice: "billing/getChoice",
  SetChoice: "billing/setChoice",
  DismissChoiceNotice: "billing/dismissChoiceNotice",
  ClaimFreeSlot: "billing/claimFreeSlot",
  ListRoutines: "billing/listRoutines",
  KeepRoutine: "billing/keepRoutine",
  ResumeRoutines: "billing/resumeRoutines",
  Presence: "billing/presence",
  SwitchToYearly: "billing/switchToYearly",
  DismissPriceNotice: "billing/dismissPriceNotice",
} as const;

export type BillingCommandType =
  (typeof BillingCommand)[keyof typeof BillingCommand];

/**
 * A Stripe-hosted URL to redirect the owner to (C8 §Billing wire surface).
 * Returned by `POST /v1/org/billing/checkout` (contextual card capture) and
 * `POST /v1/org/billing/portal` (card, invoices, cancel). The
 * client opens it via the OS external-open path — never inline.
 */
export interface BillingCheckout {
  url: string;
}

export function requireChoicePick(payload: unknown): BillingChoicePick {
  const freeOrgSlug = requireString(payload, "freeOrgSlug");
  const paid = (payload as { paidOrgSlug?: unknown }).paidOrgSlug;
  if (paid === undefined || paid === null) return { freeOrgSlug };
  return { freeOrgSlug, paidOrgSlug: requireString(payload, "paidOrgSlug") };
}

export function optionalInterval(
  payload: unknown,
): BillingInterval | undefined {
  const raw = field(payload, "interval");
  if (raw === undefined || raw === null) return undefined;
  if (BILLING_INTERVALS.some((interval) => interval === raw))
    return raw as BillingInterval;
  throw new Error("interval must be 'month' or 'year'");
}

export function requireRoutineKey(payload: unknown): PlanRoutineKey {
  return {
    orgSlug: requireString(payload, "orgSlug"),
    agentSlug: requireString(payload, "agentSlug"),
    routineId: requireString(payload, "routineId"),
  };
}
