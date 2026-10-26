import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  inviteSeatRefusal,
  inviteSendable,
} from "../src/lib/invite-seat-refusal.ts";

describe("invite seat refusals", () => {
  it("recognizes the seat answers an invite flow cannot buy past", () => {
    strictEqual(inviteSeatRefusal("quote_changed"), "quote_changed");
    strictEqual(inviteSeatRefusal("billing_owner_only"), "billing_owner_only");
    strictEqual(inviteSeatRefusal("seat_charge_in_app"), "seat_charge_in_app");
    strictEqual(inviteSeatRefusal("already_member"), null);
    strictEqual(inviteSeatRefusal(undefined), null);
  });

  it("never sends a seat refusal again, but retries any other failure", () => {
    strictEqual(inviteSendable({ status: "pending" }), true);
    strictEqual(inviteSendable({ status: "failed", error: "error" }), true);
    strictEqual(
      inviteSendable({ status: "failed", error: "quote_changed" }),
      false,
    );
    strictEqual(inviteSendable({ status: "sent" }), false);
  });
});
