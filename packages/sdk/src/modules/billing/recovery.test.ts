import type { BillingChoice, LockReason, OrgRole } from "@houston/wire-types";
import { describe, expect, it } from "vitest";
import { freeOrgBilling, paidOrgBilling } from "./org-billing-fixtures";
import { orgRecovering, orgRecovery, orgStanding } from "./recovery";

const NOW = Date.parse("2026-10-25T00:00:00Z");
const PAST = "2026-10-24T00:00:00Z";
const FUTURE = "2026-11-06T00:00:00Z";

const window = (state: "pending" | "applied", until: string | null) =>
  ({ state, changeableUntil: until }) as BillingChoice;
const open = window("applied", FUTURE);

const lockedFree = (reason: LockReason, isBillingOwner = true) =>
  freeOrgBilling({
    status: "locked",
    lockAt: PAST,
    lockReason: reason,
    freeSlot: false,
    isBillingOwner,
  });
const lockingPaid = (reason: LockReason, isBillingOwner = true) =>
  paidOrgBilling({
    status: reason === "payment_failed" ? "past_due" : "active",
    lockAt: FUTURE,
    lockReason: reason,
    isBillingOwner,
  });

describe("orgRecovery: nothing to recover from", () => {
  it("is empty for a working org, a legacy org and an unread one", () => {
    expect(orgRecovery(freeOrgBilling(), "owner", open, NOW)).toEqual([]);
    expect(orgRecovery(paidOrgBilling(), "owner", open, NOW)).toEqual([]);
    expect(orgRecovery(null, "owner", null, NOW)).toEqual([]);
    expect(orgRecovery(undefined, "owner", null, NOW)).toEqual([]);
    expect(orgRecovering(freeOrgBilling())).toBe(false);
  });
});

describe("orgRecovery for the billing owner", () => {
  it("pays, swaps or deletes an org with no live subscription", () => {
    for (const reason of ["unpaid", "canceled", "migration"] as const)
      expect(orgRecovery(lockedFree(reason), "owner", null, NOW)).toEqual([
        "checkout",
        "claim_free",
        "delete",
        "move_out",
      ]);
  });

  it("fixes a live subscription in the portal, never a second checkout", () => {
    for (const reason of ["payment_failed", "canceled"] as const)
      expect(orgRecovery(lockingPaid(reason), "owner", null, NOW)).toEqual([
        "portal",
        "move_out",
      ]);
    const failed = paidOrgBilling({
      status: "locked",
      lockAt: PAST,
      lockReason: "payment_failed",
    });
    expect(orgRecovery(failed, "owner", null, NOW)).toEqual([
      "portal",
      "move_out",
    ]);
  });

  it("pays, swaps or deletes a paid org whose subscription ended", () => {
    const lapsed = paidOrgBilling({
      status: "locked",
      lockAt: PAST,
      lockReason: "canceled",
    });
    expect(orgRecovery(lapsed, "owner", null, NOW)).toEqual([
      "checkout",
      "claim_free",
      "delete",
      "move_out",
    ]);
  });

  it("offers to change the pick only while the change window is open", () => {
    const scheduled = freeOrgBilling({
      lockAt: FUTURE,
      lockReason: "migration",
      freeSlot: false,
    });
    expect(orgRecovering(scheduled)).toBe(true);
    expect(orgRecovery(scheduled, "owner", open, NOW)).toEqual([
      "checkout",
      "change_pick",
      "claim_free",
      "delete",
      "move_out",
    ]);
    for (const closed of [
      window("applied", PAST),
      window("applied", null),
      window("pending", FUTURE),
      null,
    ])
      expect(orgRecovery(scheduled, "owner", closed, NOW)).not.toContain(
        "change_pick",
      );
  });
});

describe("orgRecovery for everyone who does not pay", () => {
  const roles: [OrgRole, string[]][] = [
    ["owner", ["move_out", "ask_owner"]],
    ["admin", ["move_out", "ask_owner"]],
    ["user", ["ask_owner"]],
  ];

  it("never offers a payment, a swap or a delete", () => {
    for (const reason of [
      "unpaid",
      "canceled",
      "migration",
      "payment_failed",
    ] as const)
      for (const [role, actions] of roles) {
        expect(orgRecovery(lockedFree(reason, false), role, open, NOW)).toEqual(
          actions,
        );
        expect(
          orgRecovery(lockingPaid(reason, false), role, open, NOW),
        ).toEqual(actions);
      }
  });
});

describe("orgStanding", () => {
  it("names the state a recovering org is in", () => {
    expect(orgStanding(freeOrgBilling())).toBe("ok");
    expect(orgStanding(paidOrgBilling())).toBe("ok");
    expect(orgStanding(freeOrgBilling({ lockAt: FUTURE }))).toBe("scheduled");
    expect(orgStanding(lockingPaid("canceled"))).toBe("scheduled");
    expect(orgStanding(lockingPaid("payment_failed"))).toBe("past_due");
    expect(orgStanding(lockedFree("unpaid"))).toBe("locked");
  });

  it("reads an older gateway's degraded team as locked, and nothing else", () => {
    expect(orgStanding(null, true)).toBe("locked");
    expect(orgStanding(null)).toBe("ok");
    expect(orgStanding(undefined, false)).toBe("ok");
    expect(orgStanding(freeOrgBilling(), true)).toBe("ok");
  });
});
