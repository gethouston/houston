import type { AdjustmentKind, OrgBilling } from "@houston/wire-types";

/**
 * The next adjustment of a yearly org: a seat added mid-year is billed for
 * the rest of the year, and a seat removed credited, on Stripe's monthly
 * true-up (or with the renewal, when that comes first). The gateway reads it
 * from Stripe and sends it to the billing owner alone; this decides whether
 * a surface names it, so every surface and the AI Manager agree.
 */
export interface NextAdjustmentView {
  kind: AdjustmentKind;
  /** Always above zero, in Stripe minor units (USD cents). */
  amountCents: number;
  /** When Stripe drafts the invoice carrying it. */
  at: string;
}

/**
 * The adjustment to show the caller, or null: only the billing owner of a
 * paid yearly org, only a non-zero amount, and only while its date is
 * ahead. A date that passed is an invoice Stripe already drafted; the next
 * orgs read drops it.
 */
export function nextAdjustmentView(
  billing: OrgBilling | null | undefined,
  now: number,
): NextAdjustmentView | null {
  const adjustment = billing?.nextAdjustment;
  if (!billing?.isBillingOwner || billing.tier !== "paid") return null;
  if (billing.interval !== "year" || !adjustment) return null;
  if (adjustment.amountCents <= 0 || !(Date.parse(adjustment.at) > now))
    return null;
  return {
    kind: adjustment.kind,
    amountCents: adjustment.amountCents,
    at: adjustment.at,
  };
}
