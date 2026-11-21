import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  type BugReportChannels,
  deliverBugReport,
} from "../src/lib/bug-report-delivery.ts";
import type { BugReportFailure } from "../src/lib/bug-report-failure.ts";

function channels(over: Partial<BugReportChannels>) {
  const calls = {
    fallback: [] as BugReportFailure[],
    intakeReports: [] as BugReportFailure[],
    fallbackReports: [] as unknown[],
  };
  const fallback = over.sendFallback ?? (async () => "event-1");
  const c: BugReportChannels = {
    sendToIntake: over.sendToIntake ?? (async () => "BUG-1"),
    sendFallback: (failure) => {
      calls.fallback.push(failure);
      return fallback(failure);
    },
    reportIntakeFailure: (failure) => calls.intakeReports.push(failure),
    reportFallbackFailure: (err) => calls.fallbackReports.push(err),
  };
  return { c, calls };
}

const usageLimit = {
  kind: "intake_unavailable",
  message: "Linear API returned GraphQL errors: usage limit exceeded",
};

describe("deliverBugReport", () => {
  it("files to Linear and touches nothing else when Linear takes it", async () => {
    const { c, calls } = channels({});
    deepStrictEqual(await deliverBugReport(c), {
      delivered: "linear",
      issueId: "BUG-1",
    });
    strictEqual(calls.fallback.length, 0);
    strictEqual(calls.intakeReports.length, 0);
  });

  it("delivers through the fallback when Linear is at its usage limit", async () => {
    const { c, calls } = channels({
      sendToIntake: () => Promise.reject(usageLimit),
    });
    deepStrictEqual(await deliverBugReport(c), {
      delivered: "fallback",
      eventId: "event-1",
    });
    deepStrictEqual(calls.intakeReports, [usageLimit]);
    deepStrictEqual(calls.fallback, [usageLimit]);
  });

  it("still delivers through the fallback on any other refusal", async () => {
    const { c, calls } = channels({
      sendToIntake: () => Promise.reject(new Error("label not found")),
    });
    strictEqual((await deliverBugReport(c)).delivered, "fallback");
    deepStrictEqual(calls.intakeReports, [
      { kind: "other", message: "label not found" },
    ]);
  });

  it("answers none when the fallback did not land either", async () => {
    const { c, calls } = channels({
      sendToIntake: () => Promise.reject(usageLimit),
      sendFallback: async () => "",
    });
    deepStrictEqual(await deliverBugReport(c), { delivered: "none" });
    strictEqual(calls.fallbackReports.length, 0);
  });

  it("reports a fallback that throws and answers none", async () => {
    const boom = new Error("sentry exploded");
    const { c, calls } = channels({
      sendToIntake: () => Promise.reject(usageLimit),
      sendFallback: () => Promise.reject(boom),
    });
    deepStrictEqual(await deliverBugReport(c), { delivered: "none" });
    deepStrictEqual(calls.fallbackReports, [boom]);
  });
});
