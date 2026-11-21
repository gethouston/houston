import type {
  ChargeSeatQuote,
  OrgBilling,
  SeatQuote,
} from "@houston/wire-types";

export type SeatAddStep =
  | { kind: "confirm_charge"; quote: ChargeSeatQuote }
  | { kind: "add" }
  | { kind: "ask_payer" };

export function seatAddStep(quote: SeatQuote): SeatAddStep {
  if (quote.kind === "charge") return { kind: "confirm_charge", quote };
  if (quote.kind === "billing_owner_only") return { kind: "ask_payer" };
  return { kind: "add" };
}

export type SeatNote =
  | { kind: "year_full" }
  | { kind: "year_free"; free: number }
  | { kind: "other_free"; free: number }
  | { kind: "other_full"; ownerName: string | null }
  | { kind: "month"; seatPriceCents: number; nextBillAt: string };

export function seatNote(
  quote: SeatQuote | null | undefined,
  billing: OrgBilling | null | undefined,
): SeatNote | null {
  const pays = billing?.isBillingOwner === true;
  switch (quote?.kind) {
    case "charge":
      return { kind: "year_full" };
    case "billing_owner_only":
      return { kind: "other_full", ownerName: quote.billingOwnerName };
    case "free_seat": {
      const free = Math.max(1, quote.paidSeats - quote.seatsInUse);
      return pays ? { kind: "year_free", free } : { kind: "other_free", free };
    }
    case "next_invoice":
      return pays && billing?.renewsAt
        ? {
            kind: "month",
            seatPriceCents: quote.seatPriceCents,
            nextBillAt: billing.renewsAt,
          }
        : null;
    default:
      return null;
  }
}

export function seatAddBlocked(quote: SeatQuote | null | undefined): boolean {
  return quote?.kind === "billing_owner_only";
}

export interface SeatChargeView {
  amountCents: number;
  currency: string;
  renewsAt: string;
  prorationDate: number;
  seatsAtRenewal: number;
  renewalCents: number | null;
}

export function seatChargeView(
  quote: ChargeSeatQuote,
  billing: OrgBilling | null | undefined,
): SeatChargeView {
  const seatsAtRenewal = Math.max(quote.paidSeats, quote.seatsInUse) + 1;
  const yearlySeat =
    billing?.interval === "year" ? billing.seatPriceCents : null;
  return {
    amountCents: quote.amountCents,
    currency: quote.currency,
    renewsAt: quote.renewsAt,
    prorationDate: quote.prorationDate,
    seatsAtRenewal,
    renewalCents: yearlySeat === null ? null : seatsAtRenewal * yearlySeat,
  };
}

export type SeatAddedNote =
  | { kind: "charged"; amountCents: number; currency: string }
  | { kind: "free" }
  | { kind: "free_other" }
  | { kind: "month"; nextBillAt: string; seats: number };

export function seatAddedNote(
  quote: SeatQuote,
  billing: OrgBilling | null | undefined,
): SeatAddedNote | null {
  const pays = billing?.isBillingOwner === true;
  switch (quote.kind) {
    case "charge":
      return {
        kind: "charged",
        amountCents: quote.amountCents,
        currency: quote.currency,
      };
    case "free_seat":
      return { kind: pays ? "free" : "free_other" };
    case "next_invoice":
      return pays && billing?.renewsAt
        ? {
            kind: "month",
            nextBillAt: billing.renewsAt,
            seats: Math.max(1, billing.seats) + 1,
          }
        : null;
    default:
      return null;
  }
}

export type SeatRemoveNote =
  | { kind: "year"; renewsAt: string }
  | { kind: "month"; nextBillAt: string };

export function seatRemoveNote(
  billing: OrgBilling | null | undefined,
): SeatRemoveNote | null {
  if (billing?.tier !== "paid" || !billing.renewsAt) return null;
  if (billing.interval === "year")
    return { kind: "year", renewsAt: billing.renewsAt };
  if (billing.interval === "month" && billing.isBillingOwner)
    return { kind: "month", nextBillAt: billing.renewsAt };
  return null;
}
