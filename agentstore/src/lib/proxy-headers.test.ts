import { describe, expect, it } from "vitest";
import { clientIpFromHeaders } from "./proxy-headers";

describe("clientIpFromHeaders", () => {
  it("reads the rightmost X-Forwarded-For hop (the IP the ingress appended)", () => {
    // Traefik appends the real client IP to the RIGHT; entries to its left are
    // client-supplied and forgeable. The gateway trusts the rightmost hop, so the
    // store must forward the same one.
    const headers = new Headers({
      "x-forwarded-for": "6.6.6.6, 7.7.7.7, 203.0.113.9",
    });
    expect(clientIpFromHeaders(headers)).toBe("203.0.113.9");
  });

  it("ignores a client-forged leftmost hop", () => {
    const headers = new Headers({
      "x-forwarded-for": "1.2.3.4, 203.0.113.9",
    });
    expect(clientIpFromHeaders(headers)).toBe("203.0.113.9");
  });

  it("handles a single hop", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.9" });
    expect(clientIpFromHeaders(headers)).toBe("203.0.113.9");
  });

  it("falls back to x-real-ip when no forwarded-for is present", () => {
    const headers = new Headers({ "x-real-ip": "198.51.100.2" });
    expect(clientIpFromHeaders(headers)).toBe("198.51.100.2");
  });

  it("returns 'unknown' when nothing identifies the client", () => {
    expect(clientIpFromHeaders(new Headers())).toBe("unknown");
  });
});
