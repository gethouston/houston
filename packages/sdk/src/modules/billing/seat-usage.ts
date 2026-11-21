import type { OrgBilling } from "@houston/wire-types";

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
