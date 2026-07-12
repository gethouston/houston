import { IdentityError } from "@houston/app/lib/identity";
import { describe, expect, it } from "vitest";
import {
  adminAuthMessage,
  isTerminalRefreshError,
  parseStoredSession,
  REFRESH_SKEW_MS,
  refreshDelayMs,
  sessionFromIdentity,
  sessionFromPassword,
} from "../src/admin/auth";

describe("admin auth logic", () => {
  it("sessionFromPassword maps the REST result to the minimal session", () => {
    expect(
      sessionFromPassword({
        idToken: "id",
        refreshToken: "rt",
        expiresAt: 123,
        uid: "u",
        email: "a@b.co",
      }),
    ).toEqual({
      idToken: "id",
      refreshToken: "rt",
      expiresAt: 123,
      email: "a@b.co",
    });
  });

  it("sessionFromIdentity keeps token + email off a popup Session", () => {
    expect(
      sessionFromIdentity({
        idToken: "id",
        refreshToken: "rt",
        expiresAt: 9,
        uid: "u",
        email: "g@x.co",
        emailVerified: true,
        displayName: null,
        photoUrl: null,
        provider: "google.com",
      }),
    ).toEqual({
      idToken: "id",
      refreshToken: "rt",
      expiresAt: 9,
      email: "g@x.co",
    });
  });

  it("refreshDelayMs fires REFRESH_SKEW_MS before expiry, never negative", () => {
    const now = 1_000_000;
    expect(refreshDelayMs(now + REFRESH_SKEW_MS + 60_000, now)).toBe(60_000);
    expect(refreshDelayMs(now, now)).toBe(0); // already inside the skew window
    expect(refreshDelayMs(now - 999, now)).toBe(0); // already expired → clamped
  });

  it("isTerminalRefreshError is true only for an expired / invalid refresh token", () => {
    expect(
      isTerminalRefreshError(new IdentityError("invalid_refresh_token")),
    ).toBe(true);
    expect(isTerminalRefreshError(new IdentityError("token_expired"))).toBe(
      true,
    );
    expect(isTerminalRefreshError(new IdentityError("network"))).toBe(false);
    expect(isTerminalRefreshError(new Error("boom"))).toBe(false);
  });

  it("parseStoredSession round-trips a valid blob and rejects junk", () => {
    const valid = {
      idToken: "id",
      refreshToken: "rt",
      expiresAt: 5,
      email: "a@b.co",
    };
    expect(parseStoredSession(JSON.stringify(valid))).toEqual(valid);
    expect(parseStoredSession(null)).toBeNull();
    expect(parseStoredSession("not json")).toBeNull();
    expect(parseStoredSession(JSON.stringify({ idToken: "id" }))).toBeNull(); // missing fields
    expect(
      parseStoredSession(JSON.stringify({ ...valid, expiresAt: "5" })),
    ).toBeNull(); // wrong type
  });

  it("adminAuthMessage gives operator-friendly copy per stable code", () => {
    expect(adminAuthMessage(new IdentityError("invalid_credentials"))).toMatch(
      /incorrect email or password/i,
    );
    expect(
      adminAuthMessage(new IdentityError("operation_not_allowed")),
    ).toMatch(/isn't enabled/i);
    expect(adminAuthMessage(new IdentityError("network"))).toMatch(/network/i);
    expect(adminAuthMessage(new IdentityError("user_disabled"))).toMatch(
      /disabled/i,
    );
    expect(adminAuthMessage(new Error("raw boom"))).toBe("raw boom");
  });
});
