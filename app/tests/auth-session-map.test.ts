import { deepStrictEqual } from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  IdpSignInResult,
  TokenSignInResult,
} from "../src/lib/identity/firebase-rest.ts";
import type { IdTokenClaims } from "../src/lib/identity/id-token.ts";
import type { Session } from "../src/lib/identity/session.ts";
import {
  sessionFromCustomToken,
  sessionFromIdp,
} from "../src/lib/identity/session-from-idp.ts";

describe("identity/session-from-idp — sessionFromIdp", () => {
  it("maps a Google IdpSignInResult to a Session verbatim", () => {
    const result: IdpSignInResult = {
      idToken: "id-token",
      refreshToken: "refresh-token",
      expiresAt: 1_800_000_000_000,
      uid: "firebase-uid-1",
      email: "ada@example.com",
      emailVerified: true,
      displayName: "Ada Lovelace",
      photoUrl: "https://example.com/a.png",
      providerId: "google.com",
    };
    const expected: Session = {
      idToken: "id-token",
      refreshToken: "refresh-token",
      uid: "firebase-uid-1",
      email: "ada@example.com",
      emailVerified: true,
      displayName: "Ada Lovelace",
      photoUrl: "https://example.com/a.png",
      provider: "google.com",
      expiresAt: 1_800_000_000_000,
    };
    deepStrictEqual(sessionFromIdp(result, "google.com"), expected);
  });

  it("carries the given provider (microsoft) and preserves null profile fields", () => {
    const result: IdpSignInResult = {
      idToken: "id-token",
      refreshToken: "refresh-token",
      expiresAt: 1_700_000_000_000,
      uid: "uid-2",
      email: "",
      emailVerified: false,
      displayName: null,
      photoUrl: null,
      providerId: "microsoft.com",
    };
    const session = sessionFromIdp(result, "microsoft.com");
    deepStrictEqual(session.provider, "microsoft.com");
    deepStrictEqual(session.displayName, null);
    deepStrictEqual(session.photoUrl, null);
    deepStrictEqual(session.email, "");
  });
});

describe("identity/session-from-idp — sessionFromCustomToken", () => {
  const tokens: TokenSignInResult = {
    idToken: "otp-id-token",
    refreshToken: "otp-refresh-token",
    expiresAt: 1_900_000_000_000,
  };

  it("assembles the OTP session from tokens + decoded claims", () => {
    const claims: IdTokenClaims = {
      sub: "firebase-uid-otp",
      email: "otp@example.com",
      email_verified: true,
      name: "Grace Hopper",
      picture: "https://example.com/g.png",
    };
    const expected: Session = {
      idToken: "otp-id-token",
      refreshToken: "otp-refresh-token",
      uid: "firebase-uid-otp",
      email: "otp@example.com",
      emailVerified: true,
      displayName: "Grace Hopper",
      photoUrl: "https://example.com/g.png",
      provider: "custom",
      expiresAt: 1_900_000_000_000,
    };
    deepStrictEqual(sessionFromCustomToken(tokens, claims), expected);
  });

  it("defaults missing claim fields (email/verified/name/picture)", () => {
    const claims: IdTokenClaims = { sub: "uid-min" };
    const session = sessionFromCustomToken(tokens, claims);
    deepStrictEqual(session.email, "");
    deepStrictEqual(session.emailVerified, false);
    deepStrictEqual(session.displayName, null);
    deepStrictEqual(session.photoUrl, null);
    deepStrictEqual(session.uid, "uid-min");
    deepStrictEqual(session.provider, "custom");
  });
});
