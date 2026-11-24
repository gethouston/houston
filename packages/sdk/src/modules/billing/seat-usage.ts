import type { OrgBilling } from "@houston/wire-types";

/**
 * The paid seats of a live yearly org against the seats in use. A yearly org
 * keeps a removed person's seat paid until renewal, so `free` seats are paid
 * for and unused: the next person added takes one at no charge. Null on every
 * other org (the wire sends no counts there).
 */
export interface SeatUsageView {
  paidSeats: number;
  inUse: number;
  free: number;
}

export function seatUsageView(
  billing: OrgBilling | null | undefined,
): SeatUsageView | null {
  if (billing?.tier !== "paid" || billing.interval !== "year") return null;
  const { paidSeats, seatsInUse } = billing;
  if (paidSeats === null || seatsInUse === null) return null;
  return {
    paidSeats,
    inUse: seatsInUse,
    free: Math.max(0, paidSeats - seatsInUse),
  };
}

/**
 * When a paid org is next billed: a yearly plan `renews` on that day, a
 * monthly one sends its `next_bill`. Null without a live subscription date.
 */
export type BillingRenewal =
  | { kind: "renews"; at: string }
  | { kind: "next_bill"; at: string };

export function billingRenewal(
  billing: OrgBilling | null | undefined,
): BillingRenewal | null {
  if (billing?.tier !== "paid" || !billing.renewsAt) return null;
  if (billing.interval === "year")
    return { kind: "renews", at: billing.renewsAt };
  if (billing.interval === "month")
    return { kind: "next_bill", at: billing.renewsAt };
  return null;
}
