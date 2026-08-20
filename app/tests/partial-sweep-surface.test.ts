import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  partialSweepToastKind,
  representativeSweepFailure,
} from "../src/lib/partial-sweep-surface.ts";

/**
 * HOUSTON-APP-538. The cross-agent sweep surfaced EVERY partial answer as the
 * error path (toast bookkeeping + Sentry capture) knowing only which agents
 * failed, never why — so the routine case, an asleep engine pod whose cold
 * start outlived the transport's wake budget (the gateway's
 * `503 {"error":"engine unavailable"}`, an expected state with its own quiet
 * surface since HOU-1114), filed 465 error events in twelve days. The reasons
 * now travel with the sweep and pick the register here.
 */

/** The exact shape the hosted adapter throws for a pod that is not up yet:
 *  `HoustonEngineError` mints `"<reason> (engine error <status>)"`. */
const wakingError = () => {
  const err = new Error("engine unavailable (engine error 503)");
  err.name = "HoustonEngineError";
  return Object.assign(err, { status: 503 });
};

/** WebKit's fetch transport rejection — the device dropped offline. */
const offlineError = () => new TypeError("Load failed");

/** A read failure that IS a bug: must keep reporting. (A deleted agent's
 *  `404 agent not found` never reaches this layer any more — the engine call
 *  layer partitions it out and heals the roster, `partitionAgentGoneReads`.) */
const realError = () => {
  const err = new Error("internal error (engine error 500)");
  err.name = "HoustonEngineError";
  return Object.assign(err, { status: 500 });
};

describe("representativeSweepFailure", () => {
  it("judges a mixed sweep by its worst member — a real failure never hides behind waking pods", () => {
    const real = realError();
    strictEqual(
      representativeSweepFailure([wakingError(), real, offlineError()]),
      real,
    );
  });

  it("falls back to the first reason when every failure is an expected state", () => {
    const first = wakingError();
    strictEqual(representativeSweepFailure([first, offlineError()]), first);
  });
});

describe("partialSweepToastKind", () => {
  it("gives a waking pod the quiet HOU-1114 surface, not a bug report", () => {
    strictEqual(partialSweepToastKind("notice", wakingError()), "waking");
  });

  it("gives an offline drop the connectivity surface (HOU-1085)", () => {
    strictEqual(
      partialSweepToastKind("notice", offlineError()),
      "connectivity",
    );
  });

  it("keeps the error surface for a real per-agent failure", () => {
    strictEqual(partialSweepToastKind("notice", realError()), "error");
  });

  it("a coding-bug TypeError is never mistaken for connectivity", () => {
    strictEqual(
      partialSweepToastKind(
        "notice",
        new TypeError("undefined is not a function"),
      ),
      "error",
    );
  });

  it("escalation always reports — even a 'waking' pod, because it never actually woke", () => {
    strictEqual(partialSweepToastKind("escalate", wakingError()), "error");
    strictEqual(partialSweepToastKind("escalate", offlineError()), "error");
  });
});
