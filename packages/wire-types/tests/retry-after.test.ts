import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { parseRetryAfterMs, retryAfterMsOf } from "../src/retry-after.ts";

// A fixed "now" so the HTTP-date cases assert exact durations.
const NOW = Date.parse("Wed, 21 Oct 2026 07:28:00 GMT");

describe("parseRetryAfterMs", () => {
  it("reads delay-seconds, the form Houston's hosts send", () => {
    strictEqual(parseRetryAfterMs("2", NOW), 2_000);
    strictEqual(parseRetryAfterMs("0", NOW), 0);
    strictEqual(parseRetryAfterMs("120", NOW), 120_000);
  });

  it("tolerates the surrounding whitespace a proxy may add", () => {
    strictEqual(parseRetryAfterMs("  5\n", NOW), 5_000);
  });

  it("reads an HTTP-date as the distance from now", () => {
    strictEqual(
      parseRetryAfterMs("Wed, 21 Oct 2026 07:28:30 GMT", NOW),
      30_000,
    );
  });

  it("clamps a date already in the past to 'retry now'", () => {
    strictEqual(parseRetryAfterMs("Wed, 21 Oct 2026 07:27:00 GMT", NOW), 0);
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
      strictEqual(parseRetryAfterMs(bad, NOW), undefined, `parsed ${bad}`);
    }
  });
});

describe("retryAfterMsOf", () => {
  it("reads the header off a response's header bag", () => {
    const headers = new Headers({ "Retry-After": "3" });
    strictEqual(retryAfterMsOf(headers, NOW), 3_000);
  });

  it("answers undefined when the responder did not expose the header", () => {
    // The cross-origin case: without `Access-Control-Expose-Headers` the
    // browser hands JS a bag that simply has no Retry-After in it.
    strictEqual(retryAfterMsOf(new Headers(), NOW), undefined);
  });
});
