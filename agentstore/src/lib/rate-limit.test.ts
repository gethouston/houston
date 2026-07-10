import { describe, expect, it } from "vitest";
import { clientIpFromHeaders, rateLimit } from "./rate-limit";

describe("rateLimit", () => {
  it("allows up to `limit` calls per window, then blocks", () => {
    const key = `test:${Math.random()}`;
    expect(rateLimit(key, 3, 60_000)).toBe(true);
    expect(rateLimit(key, 3, 60_000)).toBe(true);
    expect(rateLimit(key, 3, 60_000)).toBe(true);
    expect(rateLimit(key, 3, 60_000)).toBe(false);
  });

  it("keeps separate counters per key", () => {
    const a = `a:${Math.random()}`;
    const b = `b:${Math.random()}`;
    expect(rateLimit(a, 1, 60_000)).toBe(true);
    expect(rateLimit(a, 1, 60_000)).toBe(false);
    expect(rateLimit(b, 1, 60_000)).toBe(true);
  });

  it("resets after the window elapses", () => {
    const key = `test:${Math.random()}`;
    expect(rateLimit(key, 1, 0)).toBe(true);
    // A zero-length window is already expired on the next call.
    expect(rateLimit(key, 1, 0)).toBe(true);
  });
});

describe("clientIpFromHeaders", () => {
  it("prefers cf-connecting-ip", () => {
    const h = new Headers({
      "cf-connecting-ip": "9.9.9.9",
      "x-forwarded-for": "1.1.1.1, 2.2.2.2",
    });
    expect(clientIpFromHeaders(h)).toBe("9.9.9.9");
  });

  it("falls back to the first x-forwarded-for entry", () => {
    const h = new Headers({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" });
    expect(clientIpFromHeaders(h)).toBe("1.1.1.1");
  });

  it("falls back to a constant when no IP is present", () => {
    expect(clientIpFromHeaders(new Headers())).toBe("unknown");
  });
});
