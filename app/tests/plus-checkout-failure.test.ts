import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { surfacePlusCheckoutFailure } from "../src/lib/plus-checkout-failure";

function refusal(status: number, code: string): Error {
  return Object.assign(new Error(`engine request failed (${status})`), {
    status,
    body: { error: "refused", code },
  });
}

function harness() {
  const seen = {
    invalidated: 0,
    expected: [] as [string, string][],
    reported: [] as unknown[],
  };
  const deps = {
    invalidatePlan: () => {
      seen.invalidated += 1;
    },
    showExpected: (title: string, body: string) => {
      seen.expected.push([title, body]);
    },
    report: (error: unknown) => {
      seen.reported.push(error);
    },
  };
  return { seen, deps };
}

describe("a failed Plus checkout", () => {
  test("already Plus refreshes the plan and says so, with no report", () => {
    const { seen, deps } = harness();
    surfacePlusCheckoutFailure(refusal(409, "already_plus"), deps);
    assert.equal(seen.invalidated, 1);
    assert.deepEqual(seen.expected, [
      ["plan:checkoutAlreadyPlusTitle", "plan:checkoutAlreadyPlusBody"],
    ]);
    assert.equal(seen.reported.length, 0);
  });

  test("an account being deleted explains why, with no report", () => {
    const { seen, deps } = harness();
    surfacePlusCheckoutFailure(refusal(410, "account_deleted"), deps);
    assert.deepEqual(seen.expected, [
      ["plan:checkoutAccountDeletedTitle", "plan:checkoutAccountDeletedBody"],
    ]);
    assert.equal(seen.invalidated, 0);
    assert.equal(seen.reported.length, 0);
  });

  test("a plan switched off reads as unavailable, with no report", () => {
    const { seen, deps } = harness();
    surfacePlusCheckoutFailure(refusal(503, "not_configured"), deps);
    assert.deepEqual(seen.expected, [
      ["plan:checkoutUnavailableTitle", "plan:checkoutUnavailableBody"],
    ]);
    assert.equal(seen.reported.length, 0);
  });

  test("anything else is reported exactly once and shows no expected copy", () => {
    const { seen, deps } = harness();
    const error = new Error("boom");
    surfacePlusCheckoutFailure(error, deps);
    assert.deepEqual(seen.reported, [error]);
    assert.equal(seen.expected.length, 0);
  });
});

describe("the engine-call layer leaves checkout refusals to the checkout", () => {
  // `call()` must not report or toast what the checkout surfaces itself; any
  // other failure it reports once, and the checkout's own report dedupes.
  const source = readFileSync(
    join(import.meta.dirname, "../src/lib/tauri.ts"),
    "utf8",
  );

  test("create_plus_checkout silences the C19 refusals", () => {
    const start = source.indexOf("createPlusCheckout:");
    const body = source.slice(
      start,
      source.indexOf("createPlusPortal:", start),
    );
    assert.match(
      body,
      /silence:\s*\(error\)\s*=>\s*plusCheckoutRefusal\(error\)/,
    );
  });

  test("the presence heartbeat never toasts", () => {
    const start = source.indexOf("reportPresence:");
    const body = source.slice(start, source.indexOf("};", start));
    assert.match(body, /toast:\s*false/);
  });
});
