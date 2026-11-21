import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  partialSweepToastKind,
  representativeSweepFailure,
} from "../src/lib/partial-sweep-surface.ts";

const wakingError = () => {
  const err = new Error("engine unavailable (engine error 503)");
  err.name = "HoustonEngineError";
  return Object.assign(err, { status: 503 });
};

const offlineError = () => new TypeError("Load failed");

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
  it("gives a waking pod the quiet HOU-1114 surface, not a bug report — at notice and at escalation alike", () => {
    strictEqual(partialSweepToastKind(wakingError()), "waking");
  });

  it("gives an offline drop the connectivity surface (HOU-1085)", () => {
    strictEqual(partialSweepToastKind(offlineError()), "connectivity");
  });

  it("keeps the error surface for a real per-agent failure", () => {
    strictEqual(partialSweepToastKind(realError()), "error");
  });

  it("a coding-bug TypeError is never mistaken for connectivity", () => {
    strictEqual(
      partialSweepToastKind(new TypeError("undefined is not a function")),
      "error",
    );
  });
});
