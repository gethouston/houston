import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isFirstDayNotPendingError,
  isFirstDayPending,
} from "../src/lib/agent-first-day-model.ts";

describe("isFirstDayPending", () => {
  it("offers the start button only on an explicit pending", () => {
    assert.equal(isFirstDayPending({ firstDay: "pending" }), true);
  });

  it("treats a first day that ran as done", () => {
    assert.equal(isFirstDayPending({ firstDay: "started" }), false);
  });

  it("treats an employee that predates the field as done", () => {
    assert.equal(isFirstDayPending({ provider: "anthropic" }), false);
    assert.equal(isFirstDayPending({}), false);
  });

  it("shows nothing while the config is still loading", () => {
    assert.equal(isFirstDayPending(undefined), false);
  });
});

describe("isFirstDayNotPendingError", () => {
  it("names the host's refusal of a start button that outlived its first day", () => {
    assert.equal(
      isFirstDayNotPendingError({
        status: 409,
        body: { error: "x", code: "first_day_not_pending" },
      }),
      true,
    );
  });

  it("leaves every other failure to be reported", () => {
    assert.equal(
      isFirstDayNotPendingError({
        status: 409,
        body: { code: "first_day_not_started" },
      }),
      false,
    );
    assert.equal(isFirstDayNotPendingError({ status: 409, body: {} }), false);
    assert.equal(isFirstDayNotPendingError(new Error("boom")), false);
    assert.equal(isFirstDayNotPendingError(null), false);
  });
});
