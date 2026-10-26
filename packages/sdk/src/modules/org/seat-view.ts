/**
 * What the add-someone and remove-someone flows say about seats, read off a
 * seat quote and the org's billing. Pure: every surface (and the AI Manager)
 * reaches the same answer for the same wire, and none re-derives a rule.
 */

import type {
  ChargeSeatQuote,
  OrgBilling,
  SeatQuote,
} from "@houston/wire-types";

/**
 * What pressing Add does with the latest quote: ask the payer to confirm a
 * charge first, add straight away (nothing is charged), or nothing at all
 * because only the person who pays can add a seat.
 */
export type SeatAddStep =
  | { kind: "confirm_charge"; quote: ChargeSeatQuote }
  | { kind: "add" }
  | { kind: "ask_payer" };

export function seatAddStep(quote: SeatQuote): SeatAddStep {
  if (quote.kind === "charge") return { kind: "confirm_charge", quote };
  if (quote.kind === "billing_owner_only") return { kind: "ask_payer" };
  return { kind: "add" };
}

/**
 * The line under the add form, before anything is sent:
 * - `year_full`: the payer, every paid seat in use; the price comes before
 *   any charge;
 * - `year_free` / `other_free`: `free` paid seats are unused, so the add costs
 *   nothing (said to the payer, or to another owner);
 * - `other_full`: another owner, every paid seat in use; only the payer can
 *   add a seat, so Add is off;
 * - `month`: the payer of a monthly org; each person costs `seatPriceCents` a
 *   month from the next bill on `nextBillAt`.
 * Null when there is nothing to say.
 */
export type SeatNote =
  | { kind: "year_full" }
  | { kind: "year_free"; free: number }
  | { kind: "other_free"; free: number }
  | { kind: "other_full" }
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
      return { kind: "other_full" };
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

/** Whether Add is off: every paid seat is in use and the caller does not pay. */
export function seatAddBlocked(quote: SeatQuote | null | undefined): boolean {
  return quote?.kind === "billing_owner_only";
}

/**
 * The charge dialog: what is charged now, until when, and what the plan costs
 * at renewal with the new seat. `renewalCents` is null when the org's yearly
 * seat price is not on the wire, and no renewal figure is shown.
 */
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
  const seatsAtRenewal = quote.paidSeats + 1;
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

/**
 * The line after a successful add, beside "added" / "invited": what was
 * charged for the seat (`charged`), that a free paid seat took them (`free`
 * to the payer, `free_other` to another owner), or what the next monthly bill
 * covers. Null when there is nothing to say.
 */
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

/**
 * The seat line in the remove dialog. A yearly org gives no refund: the seat
 * stays paid until `renewsAt` and the next person added takes it at no charge
 * (said to every owner). A monthly org's next bill covers one seat fewer (said
 * to the payer). Null on a free org or with no renewal date.
 */
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
