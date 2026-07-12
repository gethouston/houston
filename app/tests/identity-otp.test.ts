import { rejects, strictEqual } from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { IdentityError } from "../src/lib/identity/errors.ts";
import { startEmailOtp, verifyEmailOtp } from "../src/lib/identity/otp.ts";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

interface Captured {
  url: string;
  body: string;
}

function stub(status: number, body: unknown): Captured {
  const captured: Captured = { url: "", body: "" };
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    captured.url = String(url);
    captured.body = String(init?.body ?? "");
    return new Response(body === undefined ? null : JSON.stringify(body), {
      status,
    });
  }) as typeof fetch;
  return captured;
}

function hasCode(code: string) {
  return (e: unknown) => e instanceof IdentityError && e.code === code;
}

const GATEWAY = "https://gw.houston.ai/";

describe("identity/otp startEmailOtp", () => {
  it("POSTs the email to /v1/auth/email-otp/start and resolves on 204", async () => {
    const cap = stub(204, undefined);
    await startEmailOtp(GATEWAY, "user@example.com");
    // trailing slash on the gateway is normalized (no double slash)
    strictEqual(cap.url, "https://gw.houston.ai/v1/auth/email-otp/start");
    strictEqual(JSON.parse(cap.body).email, "user@example.com");
  });

  it("maps 429 to otp_rate_limited", async () => {
    stub(429, { error: "slow down" });
    await rejects(
      startEmailOtp(GATEWAY, "u@e.com"),
      hasCode("otp_rate_limited"),
    );
  });

  it("maps a thrown fetch to network", async () => {
    globalThis.fetch = (async () => {
      throw new TypeError("offline");
    }) as typeof fetch;
    await rejects(startEmailOtp(GATEWAY, "u@e.com"), hasCode("network"));
  });
});

describe("identity/otp verifyEmailOtp", () => {
  it("returns the gateway custom token on 200", async () => {
    const cap = stub(200, { customToken: "custom-abc" });
    const r = await verifyEmailOtp(GATEWAY, "u@e.com", "123456");
    strictEqual(r.customToken, "custom-abc");
    strictEqual(cap.url, "https://gw.houston.ai/v1/auth/email-otp/verify");
    const payload = JSON.parse(cap.body);
    strictEqual(payload.email, "u@e.com");
    strictEqual(payload.code, "123456");
  });

  it("maps 401 to otp_invalid_code", async () => {
    stub(401, { error: "wrong" });
    await rejects(
      verifyEmailOtp(GATEWAY, "u@e.com", "000000"),
      hasCode("otp_invalid_code"),
    );
  });

  it("maps 429 to otp_rate_limited", async () => {
    stub(429, {});
    await rejects(
      verifyEmailOtp(GATEWAY, "u@e.com", "000000"),
      hasCode("otp_rate_limited"),
    );
  });

  it("treats a 200 without a customToken as malformed_response", async () => {
    stub(200, { notToken: "x" });
    await rejects(
      verifyEmailOtp(GATEWAY, "u@e.com", "123456"),
      hasCode("malformed_response"),
    );
  });
});
