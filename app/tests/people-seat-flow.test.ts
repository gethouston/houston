import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { OrgBilling } from "@houston/engine-adapter";
import type { ChargeSeatQuote } from "@houston/sdk";
import {
  afterAdd,
  chargeDialog,
} from "../src/components/organization/people-seat-flow.ts";

const QUOTE: ChargeSeatQuote = {
  kind: "charge",
  amountCents: 7500,
  currency: "usd",
  prorationDate: 1793000000,
  paidSeats: 2,
  seatsInUse: 2,
  renewsAt: "2027-03-26T12:00:00Z",
};

const BILLING: OrgBilling = {
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
  paidSeats: 2,
  seatsInUse: 2,
  usage: null,
  routines: null,
};

const DIALOG = {
  ...chargeDialog("jo@x.co", "user", QUOTE),
  phase: "paying" as const,
};
const base = {
  email: "jo@x.co",
  role: "user" as const,
  quote: QUOTE,
  billing: BILLING,
  dialog: DIALOG,
};

describe("people seat flow — after an add", () => {
  it("closes on success and says what the seat cost", () => {
    deepStrictEqual(
      afterAdd({
        ...base,
        outcome: { kind: "added", member: { role: "user", invited: true } },
      }),
      {
        kind: "done",
        outcome: {
          kind: "invited",
          email: "jo@x.co",
          seat: { kind: "charged", amountCents: 7500, currency: "usd" },
        },
      },
    );
  });

  it("keeps the dialog up on a declined card and on a bank check", () => {
    for (const kind of [
      "seat_payment_failed",
      "seat_payment_needs_action",
    ] as const) {
      const next = afterAdd({ ...base, outcome: { kind } });
      strictEqual(next.kind, "dialog");
      if (next.kind === "dialog")
        strictEqual(
          next.dialog.phase,
          kind === "seat_payment_failed" ? "declined" : "needs_action",
        );
    }
  });

  it("asks again with the new price when the quote changed", () => {
    const fresh = { ...QUOTE, amountCents: 9000 };
    deepStrictEqual(
      afterAdd({ ...base, outcome: { kind: "quote_changed", quote: fresh } }),
      { kind: "dialog", dialog: chargeDialog("jo@x.co", "user", fresh) },
    );
  });

  it("closes when the new quote charges nothing or only the payer can add", () => {
    deepStrictEqual(
      afterAdd({
        ...base,
        outcome: {
          kind: "quote_changed",
          quote: { kind: "free_seat", paidSeats: 3, seatsInUse: 2 },
        },
      }),
      { kind: "closed" },
    );
    deepStrictEqual(
      afterAdd({ ...base, outcome: { kind: "billing_owner_only" } }),
      {
        kind: "closed",
      },
    );
  });

  it("closes on a payment refusal with no dialog to show it in", () => {
    deepStrictEqual(
      afterAdd({
        ...base,
        dialog: null,
        outcome: { kind: "seat_payment_failed" },
      }),
      { kind: "closed" },
    );
  });
});
