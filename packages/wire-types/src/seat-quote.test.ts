import { afterEach, describe, expect, it } from "vitest";
import { parseOrgBilling } from "./org-billing";
import { parseSeatQuote, SEAT_ADD_REFUSALS } from "./seat-quote";
import { setUnreadableWireSink } from "./unreadable-wire";

const BILLING_FOR_REPORT = {
  tier: "paid",
  status: "active",
  lockAt: null,
  lockReason: null,
  freeSlot: false,
  isBillingOwner: true,
  seats: 2,
  interval: "year",
  seatPriceCents: 18000,
  seatPrices: { monthlyCents: 2000, annualCents: 18000 },
  seatGraceEndsAt: null,
  usage: null,
  routines: null,
};

const CHARGE = {
  kind: "charge",
  amountCents: 7500,
  currency: "usd",
  prorationDate: 1793000000,
  paidSeats: 2,
  seatsInUse: 2,
  renewsAt: "2027-03-26T12:00:00Z",
};

describe("parseSeatQuote", () => {
  it("reads every kind the gateway answers", () => {
    const quotes = [
      CHARGE,
      { kind: "free_seat", paidSeats: 3, seatsInUse: 2 },
      {
        kind: "billing_owner_only",
        paidSeats: 2,
        seatsInUse: 2,
        billingOwnerName: "Ana Ruiz",
      },
      { kind: "next_invoice", seatPriceCents: 2000 },
      { kind: "no_charge" },
    ];
    for (const quote of quotes) expect(parseSeatQuote(quote)).toEqual(quote);
  });

  it("reads a kind added later, or a broken charge, as no charge", () => {
    expect(parseSeatQuote({ kind: "trial_seat", days: 7 })).toEqual({
      kind: "no_charge",
    });
    expect(parseSeatQuote({ ...CHARGE, amountCents: "75" })).toEqual({
      kind: "no_charge",
    });
    expect(parseSeatQuote({ ...CHARGE, renewsAt: "soon" })).toEqual({
      kind: "no_charge",
    });
    expect(parseSeatQuote(null)).toEqual({ kind: "no_charge" });
  });
});

describe("an unreadable answer", () => {
  afterEach(() =>
    setUnreadableWireSink((source, error) => console.error(source, error)),
  );

  it("names nobody for an older gateway's payer-only quote", () => {
    expect(
      parseSeatQuote({
        kind: "billing_owner_only",
        paidSeats: 2,
        seatsInUse: 2,
      }),
    ).toEqual({
      kind: "billing_owner_only",
      paidSeats: 2,
      seatsInUse: 2,
      billingOwnerName: null,
    });
  });

  it("reports every fallback it takes", () => {
    const reports: string[] = [];
    setUnreadableWireSink((source) => reports.push(source));
    parseSeatQuote({ kind: "trial_seat" });
    parseSeatQuote({
      kind: "billing_owner_only",
      paidSeats: 2,
      seatsInUse: 2,
      billingOwnerName: 7,
    });
    parseOrgBilling({ ...BILLING_FOR_REPORT, paidSeats: "3" });
    expect(reports).toEqual([
      "seat_quote_unreadable",
      "seat_quote_owner_name_unreadable",
      "org_billing_paid_seats_unreadable",
    ]);
  });
});

describe("SEAT_ADD_REFUSALS", () => {
  it("pairs each refusal with the status the gateway answers it with", () => {
    expect(SEAT_ADD_REFUSALS).toEqual({
      seat_payment_failed: 402,
      seat_payment_needs_action: 402,
      seat_quote_changed: 409,
      seat_quote_expired: 409,
      billing_owner_only: 403,
      seat_charge_in_app: 403,
    });
  });
});

describe("OrgBilling seat counts", () => {
  const BILLING = {
    tier: "paid",
    status: "active",
    lockAt: null,
    lockReason: null,
    freeSlot: false,
    isBillingOwner: true,
    seats: 2,
    interval: "year",
    seatPriceCents: 18000,
    seatPrices: { monthlyCents: 2000, annualCents: 18000 },
    seatGraceEndsAt: null,
    renewsAt: "2027-03-26T12:00:00Z",
    priceNotice: null,
    usage: null,
    routines: null,
  };

  it("reads the paid seats and the seats in use of a live yearly org", () => {
    expect(
      parseOrgBilling({ ...BILLING, paidSeats: 3, seatsInUse: 2 }),
    ).toMatchObject({ paidSeats: 3, seatsInUse: 2 });
  });

  it("reads an older gateway, and a broken count, as null", () => {
    expect(parseOrgBilling(BILLING)).toMatchObject({
      paidSeats: null,
      seatsInUse: null,
    });
    expect(
      parseOrgBilling({ ...BILLING, paidSeats: "3", seatsInUse: -1 }),
    ).toMatchObject({ paidSeats: null, seatsInUse: null, seats: 2 });
  });
});
