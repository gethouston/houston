import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyAnalyticsError } from "../src/lib/analytics-error-kind.ts";

// The taxonomy is read off the message text, so the cases below are the
// messages the app actually surfaces, one per bucket, plus the WebKit
// transport failure that names neither "network" nor "fetch".
describe("classifyAnalyticsError", () => {
  const cases: Array<[string, string]> = [
    ["Token expired, please login again", "auth"],
    ["TypeError: Failed to fetch", "network"],
    ["Load failed", "network"],
    ["Request timeout after 30s", "network"],
    ["EACCES: permission denied", "permission"],
    ["Provider returned 429", "provider"],
    ["anthropic: overloaded", "provider"],
    ["spawn houston-engine ENOENT", "cli"],
    ["Claude hit a runtime error", "cli"],
    ["Something else entirely", "unknown"],
  ];

  for (const [message, kind] of cases) {
    it(`classifies "${message}" as ${kind}`, () => {
      assert.equal(classifyAnalyticsError(message), kind);
    });
  }

  it("is case-insensitive", () => {
    assert.equal(classifyAnalyticsError("NETWORK ERROR"), "network");
  });
});
