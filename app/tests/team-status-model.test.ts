import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type {
  BillingChoice,
  OrgBilling,
  OrgRole,
} from "@houston/engine-adapter";
import {
  isNeedsUpgradeError,
  isPersonalSpaceError,
  type TeamStatusInput,
  type TeamStatusView,
  teamStatusView,
} from "../src/lib/team-status-model.ts";

const NOW = Date.parse("2026-10-25T00:00:00Z");
const PAST = "2026-10-24T00:00:00Z";
const FUTURE = "2026-11-06T00:00:00Z";

function billing(patch: Partial<OrgBilling>): OrgBilling {
  return {
    tier: "free",
    status: "active",
    lockAt: null,
    lockReason: null,
    freeSlot: true,
    isBillingOwner: false,
    seats: 3,
    interval: null,
    seatPriceCents: 2000,
    seatPrices: { monthlyCents: 2000, annualCents: 18000 },
    seatGraceEndsAt: null,
    renewsAt: null,
    priceNotice: null,
    nextAdjustment: null,
    usage: { scope: "org", used: 10, limit: 40, resetsAt: FUTURE },
    routines: null,
    ...patch,
  };
}

/** The cutover's change window, still open, for an owner with a pick. */
const OPEN_PICK = {
  needed: true,
  state: "applied",
  changeableUntil: FUTURE,
} as BillingChoice;

const STATES: Record<string, OrgBilling> = {
  free: billing({}),
  "pool full": billing({
    usage: { scope: "org", used: 40, limit: 40, resetsAt: FUTURE },
  }),
  paid: billing({ tier: "paid", freeSlot: false, usage: null }),
  "past due": billing({
    tier: "paid",
    status: "past_due",
    freeSlot: false,
    usage: null,
    lockAt: FUTURE,
    lockReason: "payment_failed",
  }),
  "scheduled lock": billing({
    freeSlot: false,
    lockAt: FUTURE,
    lockReason: "migration",
  }),
  locked: billing({
    status: "locked",
    freeSlot: false,
    lockAt: PAST,
    lockReason: "unpaid",
  }),
  "locked, paid": billing({
    tier: "paid",
    status: "locked",
    freeSlot: false,
    usage: null,
    lockAt: PAST,
    lockReason: "payment_failed",
  }),
};

/** Who reads the org: the owner who pays, and everyone who does not. */
const READERS: Record<string, { role: OrgRole; payer: boolean }> = {
  "billing owner": { role: "owner", payer: true },
  "another owner": { role: "owner", payer: false },
  admin: { role: "admin", payer: false },
  member: { role: "user", payer: false },
};

function view(
  state: string,
  reader: string,
  patch: Partial<TeamStatusInput> = {},
): TeamStatusView {
  const { role, payer } = READERS[reader];
  return teamStatusView({
    billing: { ...STATES[state], isBillingOwner: payer },
    degraded: STATES[state].status === "locked",
    role,
    choice: OPEN_PICK,
    purchasable: true,
    checkoutOutstanding: false,
    canDelete: true,
    now: NOW,
    ...patch,
  });
}

/** The strip a reader sees, minus the dates the state already pins. */
function strip(v: TeamStatusView) {
  if (v.kind === "none") return "none";
  const { kind, payer, moveOut, tail, buttons, more, waiting } = v;
  return { kind, payer, moveOut, tail, buttons, more, waiting };
}

const ASK = (kind: string, moveOut: boolean) => ({
  kind,
  payer: false,
  moveOut,
  tail: "ask_owner",
  buttons: [],
  more: [],
  waiting: false,
});

const NON_PAYERS = (kind: string) => ({
  "another owner": ASK(kind, true),
  admin: ASK(kind, true),
  member: ASK(kind, false),
});

const EXPECTED: Record<string, Record<string, unknown>> = {
  free: {},
  "pool full": {},
  paid: {},
  "past due": {
    "billing owner": {
      kind: "past_due",
      payer: true,
      moveOut: true,
      tail: null,
      buttons: ["portal", "change_pick"],
      more: [],
      waiting: false,
    },
    ...NON_PAYERS("past_due"),
  },
  "scheduled lock": {
    "billing owner": {
      kind: "scheduled",
      payer: true,
      moveOut: true,
      tail: null,
      buttons: ["checkout", "change_pick"],
      more: ["claim_free", "delete"],
      waiting: false,
    },
    ...NON_PAYERS("scheduled"),
  },
  locked: {
    "billing owner": {
      kind: "locked",
      payer: true,
      moveOut: true,
      tail: null,
      buttons: ["checkout", "change_pick"],
      more: ["claim_free", "delete"],
      waiting: false,
    },
    ...NON_PAYERS("locked"),
  },
  "locked, paid": {
    "billing owner": {
      kind: "locked",
      payer: true,
      moveOut: true,
      tail: null,
      buttons: ["portal", "change_pick"],
      more: [],
      waiting: false,
    },
    ...NON_PAYERS("locked"),
  },
};

describe("teamStatusView: every state for every reader", () => {
  for (const state of Object.keys(STATES))
    for (const reader of Object.keys(READERS))
      it(`${state}, ${reader}`, () => {
        deepStrictEqual(
          strip(view(state, reader)),
          EXPECTED[state][reader] ?? "none",
        );
      });
});

describe("teamStatusView: what the surface leaves out", () => {
  it("drops the pay buttons in the store apps and shows the web note to the payer", () => {
    deepStrictEqual(
      strip(view("locked", "billing owner", { purchasable: false })),
      {
        kind: "locked",
        payer: true,
        moveOut: true,
        tail: "web_note",
        buttons: ["change_pick", "claim_free"],
        more: ["delete"],
        waiting: false,
      },
    );
    deepStrictEqual(
      strip(view("past due", "billing owner", { purchasable: false })),
      {
        kind: "past_due",
        payer: true,
        moveOut: true,
        tail: "web_note",
        buttons: ["change_pick"],
        more: [],
        waiting: false,
      },
    );
  });

  it("never sends a store-app reader to ask for an upgrade", () => {
    deepStrictEqual(strip(view("locked", "member", { purchasable: false })), {
      ...ASK("locked", false),
      tail: null,
    });
  });

  it("waits on an outstanding checkout, only where a pay button shows", () => {
    strictEqual(
      (
        view("locked", "billing owner", { checkoutOutstanding: true }) as {
          waiting: boolean;
        }
      ).waiting,
      true,
    );
    strictEqual(
      (
        view("locked", "member", { checkoutOutstanding: true }) as {
          waiting: boolean;
        }
      ).waiting,
      false,
    );
  });

  it("keeps a paid tier that is still past due on its strip after a checkout", () => {
    strictEqual(
      view("past due", "billing owner", { checkoutOutstanding: true }).kind,
      "past_due",
    );
  });

  it("drops Change pick once the change window closed, and Delete where no delete flow exists", () => {
    deepStrictEqual(
      strip(
        view("locked", "billing owner", { choice: null, canDelete: false }),
      ),
      {
        kind: "locked",
        payer: true,
        moveOut: true,
        tail: null,
        buttons: ["checkout", "claim_free"],
        more: [],
        waiting: false,
      },
    );
  });

  it("reads an older gateway's degraded team as locked, asking the owner", () => {
    deepStrictEqual(
      strip(view("free", "billing owner", { billing: null, degraded: true })),
      ASK("locked", false),
    );
    strictEqual(view("free", "member", { billing: null }).kind, "none");
  });

  it("shows nothing until the role is known", () => {
    strictEqual(view("locked", "billing owner", { role: null }).kind, "none");
  });

  it("carries the lock date and reason for the copy", () => {
    const v = view("past due", "admin");
    strictEqual(v.kind === "past_due" && v.lockAt, FUTURE);
    strictEqual(v.kind === "past_due" && v.lockReason, "payment_failed");
  });
});

describe("isNeedsUpgradeError", () => {
  it("matches a gateway needs_upgrade rejection", () => {
    strictEqual(isNeedsUpgradeError({ code: "needs_upgrade" }), true);
    strictEqual(
      isNeedsUpgradeError({ body: { error: "needs_upgrade" } }),
      true,
    );
  });

  // The SHIPPED gateway body: a flat `{error: "<sentence>", code}`. The
  // `HoustonEngineError.code` getter only reads the NESTED `{error:{code}}`
  // form, so without `shareErrorCode` reading `body.code` this rejection
  // classified as its English sentence and fell through to the red bug toast.
  it("matches the flat {error, code} body the Go gateway sends", () => {
    strictEqual(
      isNeedsUpgradeError({
        status: 403,
        body: { error: "team needs upgrade", code: "needs_upgrade" },
      }),
      true,
    );
  });

  it("ignores other errors", () => {
    strictEqual(isNeedsUpgradeError({ code: "not_owner" }), false);
    strictEqual(isNeedsUpgradeError(new Error("boom")), false);
    strictEqual(isNeedsUpgradeError(null), false);
  });
});

describe("isPersonalSpaceError", () => {
  it("matches a gateway personal_space rejection", () => {
    strictEqual(isPersonalSpaceError({ code: "personal_space" }), true);
    strictEqual(
      isPersonalSpaceError({ body: { error: "personal_space" } }),
      true,
    );
  });

  it("matches the flat {error, code} body the Go gateway sends", () => {
    strictEqual(
      isPersonalSpaceError({
        status: 403,
        body: {
          error: "a personal space cannot have members",
          code: "personal_space",
        },
      }),
      true,
    );
  });

  it("ignores other errors", () => {
    strictEqual(isPersonalSpaceError({ code: "needs_upgrade" }), false);
    strictEqual(isPersonalSpaceError({ code: "not_owner" }), false);
    strictEqual(isPersonalSpaceError(new Error("boom")), false);
    strictEqual(isPersonalSpaceError(null), false);
  });
});
