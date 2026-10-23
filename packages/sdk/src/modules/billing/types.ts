/**
 * Wire types + command vocabulary for the billing module: an org's Stripe
 * subscription, the hosted pages that change it, the free-slot swap, and a
 * free org's routine rules.
 *
 * Everything here is plain JSON, so it crosses the `dispatch` boundary
 * unchanged. There is no reactive scope: the summary is read when a billing
 * screen opens and each hand-off is a button's one-shot, so the module is
 * plain-async and publishes nothing (the SDK's preferences shape).
 *
 * The org's billing state rides `OrgSummary.billing` (`@houston/wire-types`),
 * the one shape every surface reads; `getBilling` answers the C8 team summary.
 */

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

/** A free-org pick off an untrusted command payload. */
export function requireChoicePick(payload: unknown): BillingChoicePick {
  const freeOrgSlug = requireString(payload, "freeOrgSlug");
  const paid = (payload as { paidOrgSlug?: unknown }).paidOrgSlug;
  if (paid === undefined || paid === null) return { freeOrgSlug };
  return { freeOrgSlug, paidOrgSlug: requireString(payload, "paidOrgSlug") };
}

/**
 * A checkout interval off an untrusted command payload: absent is the
 * default, anything but `month` or `year` is refused.
 */
export function optionalInterval(
  payload: unknown,
): BillingInterval | undefined {
  const raw = field(payload, "interval");
  if (raw === undefined || raw === null) return undefined;
  if (BILLING_INTERVALS.some((interval) => interval === raw))
    return raw as BillingInterval;
  throw new Error("interval must be 'month' or 'year'");
}

/** A routine key off an untrusted command payload. */
export function requireRoutineKey(payload: unknown): PlanRoutineKey {
  return {
    orgSlug: requireString(payload, "orgSlug"),
    agentSlug: requireString(payload, "agentSlug"),
    routineId: requireString(payload, "routineId"),
  };
}
