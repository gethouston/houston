import { strictEqual, ok } from "node:assert";
import { describe, it } from "node:test";
import { prettifyAuthError } from "../src/components/auth/auth-errors.ts";

describe("prettifyAuthError", () => {
  it("maps a null-session success to a retry message", () => {
    // verifyEmailOtp / setSession throw / emit "...returned no session" when
    // Supabase reports success but hands back no session; the user must see a
    // real message instead of being silently stranded on the sign-in screen.
    strictEqual(
      prettifyAuthError("Sign-in succeeded but returned no session."),
      "Sign-in didn't finish. Please try again.",
    );
  });

  it("maps an expired/invalid OTP to the request-a-new-code message", () => {
    strictEqual(
      prettifyAuthError("Token has expired or is invalid"),
      "That code is wrong or expired. Request a new one and try again.",
    );
  });

  it("maps a rate-limit error", () => {
    strictEqual(
      prettifyAuthError("email rate limit exceeded"),
      "Too many attempts. Wait a minute, then try again.",
    );
  });

  it("maps a disabled provider", () => {
    strictEqual(
      prettifyAuthError("Provider azure is not enabled"),
      "This sign-in option isn't turned on for Houston yet. Try another option.",
    );
  });

  it("falls back to the raw message so the user has something to report", () => {
    const out = prettifyAuthError("Some unmapped backend explosion");
    ok(out.startsWith("Sign-in failed: "));
    ok(out.includes("Some unmapped backend explosion"));
  });

  it("bounds an overly long raw message", () => {
    const out = prettifyAuthError("x".repeat(500));
    ok(out.length < 260);
    ok(out.endsWith("…"));
  });
});
