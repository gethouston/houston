import { strictEqual } from "node:assert/strict";
import { describe, it } from "node:test";
import { decodeIdTokenClaims } from "../src/lib/identity/id-token.ts";

/** Build a fake unsigned JWT with the given claims payload. */
function fakeJwt(claims: unknown): string {
  const b64url = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  return `${b64url({ alg: "RS256" })}.${b64url(claims)}.signature`;
}

describe("identity/id-token decodeIdTokenClaims", () => {
  it("decodes sub, email, and firebase provider claims", () => {
    const token = fakeJwt({
      sub: "uid-42",
      email: "otp@example.com",
      email_verified: true,
      name: "OTP User",
      picture: "https://example.com/otp-user.png",
      firebase: { sign_in_provider: "custom" },
      exp: 1_800_000_000,
    });
    const claims = decodeIdTokenClaims(token);
    strictEqual(claims?.sub, "uid-42");
    strictEqual(claims?.email, "otp@example.com");
    strictEqual(claims?.email_verified, true);
    strictEqual(claims?.picture, "https://example.com/otp-user.png");
    strictEqual(claims?.firebase?.sign_in_provider, "custom");
  });

  it("decodes payloads containing multibyte UTF-8 names", () => {
    const claims = decodeIdTokenClaims(
      fakeJwt({ sub: "u", name: "José 日本" }),
    );
    strictEqual(claims?.name, "José 日本");
  });

  it("returns null for a token with no payload segment", () => {
    strictEqual(decodeIdTokenClaims("not-a-jwt"), null);
  });

  it("returns null when the payload is not valid base64/JSON", () => {
    strictEqual(decodeIdTokenClaims("aaa.$$$notbase64$$$.bbb"), null);
  });

  it("returns null when claims lack a string sub", () => {
    strictEqual(decodeIdTokenClaims(fakeJwt({ email: "x@y.com" })), null);
  });
});
