import { describe, expect, it } from "vitest";
import { parseRetryAfterMs, retryAfterMsOf } from "../src/retry-after.ts";

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
    expect(retryAfterMsOf(new Headers(), NOW)).toBeUndefined();
  });
});
