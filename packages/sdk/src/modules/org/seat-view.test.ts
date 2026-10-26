import type { ChargeSeatQuote, SeatQuote } from "@houston/wire-types";
import { describe, expect, it } from "vitest";
import { paidOrgBilling } from "../billing/org-billing-fixtures";
import {
  seatAddBlocked,
  seatAddedNote,
  seatAddStep,
  seatChargeView,
  seatNote,
  seatRemoveNote,
} from "./seat-view";

const RENEWS = "2027-03-26T12:00:00Z";
const CHARGE: ChargeSeatQuote = {
  kind: "charge",
  amountCents: 7500,
  currency: "usd",
  prorationDate: 1793000000,
  paidSeats: 2,
  seatsInUse: 2,
  renewsAt: RENEWS,
};
const FREE: SeatQuote = { kind: "free_seat", paidSeats: 3, seatsInUse: 1 };
const PAYER_ONLY: SeatQuote = {
  kind: "billing_owner_only",
  paidSeats: 2,
  seatsInUse: 2,
};
const MONTH: SeatQuote = { kind: "next_invoice", seatPriceCents: 2000 };

const yearly = (isBillingOwner: boolean) =>
  paidOrgBilling({
    interval: "year",
    seatPriceCents: 18000,
    renewsAt: RENEWS,
    isBillingOwner,
    seats: 2,
    paidSeats: 2,
    seatsInUse: 2,
  });
const monthly = (isBillingOwner: boolean) =>
  paidOrgBilling({
    interval: "month",
    renewsAt: "2026-11-26T12:00:00Z",
    isBillingOwner,
    seats: 3,
  });

describe("seatAddStep", () => {
  it("confirms a charge, asks the payer, and adds everything else", () => {
    expect(seatAddStep(CHARGE)).toEqual({
      kind: "confirm_charge",
      quote: CHARGE,
    });
    expect(seatAddStep(PAYER_ONLY)).toEqual({ kind: "ask_payer" });
    for (const quote of [FREE, MONTH, { kind: "no_charge" } as const])
      expect(seatAddStep(quote)).toEqual({ kind: "add" });
  });

  it("blocks Add only while the payer is the one who can add a seat", () => {
    expect(seatAddBlocked(PAYER_ONLY)).toBe(true);
    expect(seatAddBlocked(CHARGE)).toBe(false);
    expect(seatAddBlocked(undefined)).toBe(false);
  });
});

describe("seatNote", () => {
  it("tells the payer of a full yearly org that the price comes first", () => {
    expect(seatNote(CHARGE, yearly(true))).toEqual({ kind: "year_full" });
  });

  it("counts the free paid seats for the payer and for another owner", () => {
    expect(seatNote(FREE, yearly(true))).toEqual({
      kind: "year_free",
      free: 2,
    });
    expect(seatNote(FREE, yearly(false))).toEqual({
      kind: "other_free",
      free: 2,
    });
  });

  it("tells another owner that only the payer can add a seat", () => {
    expect(seatNote(PAYER_ONLY, yearly(false))).toEqual({
      kind: "other_full",
    });
  });

  it("names the monthly price and next bill to the payer alone", () => {
    expect(seatNote(MONTH, monthly(true))).toEqual({
      kind: "month",
      seatPriceCents: 2000,
      nextBillAt: "2026-11-26T12:00:00Z",
    });
    expect(seatNote(MONTH, monthly(false))).toBeNull();
    expect(
      seatNote(MONTH, paidOrgBilling({ interval: "month", renewsAt: null })),
    ).toBeNull();
  });

  it("says nothing without a quote or with nothing to charge", () => {
    expect(seatNote(undefined, yearly(true))).toBeNull();
    expect(seatNote({ kind: "no_charge" }, yearly(true))).toBeNull();
  });
});

describe("seatChargeView", () => {
  it("prices the renewal with the new seat at the yearly seat price", () => {
    expect(seatChargeView(CHARGE, yearly(true))).toEqual({
      amountCents: 7500,
      currency: "usd",
      renewsAt: RENEWS,
      prorationDate: 1793000000,
      seatsAtRenewal: 3,
      renewalCents: 54000,
    });
  });

  it("shows no renewal figure without a yearly seat price", () => {
    expect(
      seatChargeView(CHARGE, paidOrgBilling({ interval: null })).renewalCents,
    ).toBeNull();
    expect(seatChargeView(CHARGE, null).renewalCents).toBeNull();
  });
});

describe("seatAddedNote", () => {
  it("says what was charged, or that a free seat took them", () => {
    expect(seatAddedNote(CHARGE, yearly(true))).toEqual({
      kind: "charged",
      amountCents: 7500,
      currency: "usd",
    });
    expect(seatAddedNote(FREE, yearly(true))).toEqual({ kind: "free" });
    expect(seatAddedNote(FREE, yearly(false))).toEqual({ kind: "free_other" });
  });

  it("counts the seats the next monthly bill covers, for the payer", () => {
    expect(seatAddedNote(MONTH, monthly(true))).toEqual({
      kind: "month",
      nextBillAt: "2026-11-26T12:00:00Z",
      seats: 4,
    });
    expect(seatAddedNote(MONTH, monthly(false))).toBeNull();
    expect(seatAddedNote({ kind: "no_charge" }, monthly(true))).toBeNull();
  });
});

describe("seatRemoveNote", () => {
  it("keeps a yearly seat paid until renewal, said to every owner", () => {
    expect(seatRemoveNote(yearly(false))).toEqual({
      kind: "year",
      renewsAt: RENEWS,
    });
  });

  it("lowers the next monthly bill, said to the payer", () => {
    expect(seatRemoveNote(monthly(true))).toEqual({
      kind: "month",
      nextBillAt: "2026-11-26T12:00:00Z",
    });
    expect(seatRemoveNote(monthly(false))).toBeNull();
  });

  it("says nothing on a free org or without a renewal date", () => {
    expect(seatRemoveNote(paidOrgBilling({ tier: "free" }))).toBeNull();
    expect(
      seatRemoveNote(paidOrgBilling({ interval: "year", renewsAt: null })),
    ).toBeNull();
    expect(seatRemoveNote(null)).toBeNull();
  });
});
