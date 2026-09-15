import { describe, expect, it } from "vitest";
import { parseRetryAfterMs, retryAfterMsOf } from "../src/retry-after.ts";

// A fixed "now" so the HTTP-date cases assert exact durations.
const NOW = Date.parse("Wed, 21 Oct 2026 07:28:00 GMT");

describe("parseRetryAfterMs", () => {
  it("reads delay-seconds, the form Houston's hosts send", () => {
    expect(parseRetryAfterMs("2", NOW)).toBe(2_000);
    expect(parseRetryAfterMs("0", NOW)).toBe(0);
    expect(parseRetryAfterMs("120", NOW)).toBe(120_000);
  });

  it("tolerates the surrounding whitespace a proxy may add", () => {
    expect(parseRetryAfterMs("  5\n", NOW)).toBe(5_000);
  });

  it("reads an HTTP-date as the distance from now", () => {
    expect(parseRetryAfterMs("Wed, 21 Oct 2026 07:28:30 GMT", NOW)).toBe(
      30_000,
    );
  });

  it("clamps a date already in the past to 'retry now'", () => {
    expect(parseRetryAfterMs("Wed, 21 Oct 2026 07:27:00 GMT", NOW)).toBe(0);
  });

  it("ignores garbage rather than sleeping on a guess", () => {
    // A caller with no hint falls back to its own backoff, which is always
    // safe; a caller that trusted "-5" or "soon" would not be.
    for (const bad of [
      undefined,
      null,
      "",
      "   ",
      "-5",
      "1.5",
      "2 seconds",
      "soon",
      "NaN",
    ]) {
      expect(parseRetryAfterMs(bad, NOW), `parsed ${bad}`).toBeUndefined();
    }
  });
});

describe("retryAfterMsOf", () => {
  it("reads the header off a response's header bag", () => {
    const headers = new Headers({ "Retry-After": "3" });
    expect(retryAfterMsOf(headers, NOW)).toBe(3_000);
  });

  it("answers undefined when the responder did not expose the header", () => {
    // The cross-origin case: without `Access-Control-Expose-Headers` the
    // browser hands JS a bag that simply has no Retry-After in it.
    expect(retryAfterMsOf(new Headers(), NOW)).toBeUndefined();
  });
});
