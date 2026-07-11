import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { authErrorKey } from "../src/components/auth/auth-errors.ts";
import { IdentityError } from "../src/lib/identity/errors.ts";

describe("authErrorKey", () => {
  it("maps an IdentityError instance by its code", () => {
    strictEqual(
      authErrorKey(new IdentityError("invalid_credentials")),
      "auth.invalidCredentials",
    );
    strictEqual(
      authErrorKey(new IdentityError("otp_invalid_code")),
      "auth.otpInvalid",
    );
    strictEqual(authErrorKey(new IdentityError("network")), "auth.network");
  });

  it("maps a bare IdentityErrorCode string (the onAuthError shape)", () => {
    strictEqual(authErrorKey("otp_rate_limited"), "auth.otpRateLimited");
    strictEqual(authErrorKey("user_disabled"), "auth.userDisabled");
    strictEqual(authErrorKey("too_many_attempts"), "auth.tooManyAttempts");
  });

  it("collapses related codes into one user-facing bucket", () => {
    // Both "this email exists under another provider" shapes read the same.
    strictEqual(authErrorKey("email_exists"), "auth.credentialMismatch");
    strictEqual(authErrorKey("credential_mismatch"), "auth.credentialMismatch");
    // Config-shaped failures the user cannot fix all point at support.
    strictEqual(authErrorKey("api_key_invalid"), "auth.configError");
    strictEqual(authErrorKey("invalid_custom_token"), "auth.configError");
    strictEqual(authErrorKey("invalid_idp_response"), "auth.configError");
    strictEqual(authErrorKey("malformed_response"), "auth.configError");
    strictEqual(authErrorKey("invalid_refresh_token"), "auth.configError");
  });

  it("maps a disabled provider", () => {
    strictEqual(authErrorKey("operation_not_allowed"), "auth.providerDisabled");
  });

  it("maps an expired token like a stale OTP (request a new code)", () => {
    strictEqual(authErrorKey("token_expired"), "auth.otpInvalid");
  });

  it("falls back to generic for anything unrecognized", () => {
    strictEqual(authErrorKey("unknown"), "auth.generic");
    strictEqual(authErrorKey(new Error("boom")), "auth.generic");
    strictEqual(
      authErrorKey("Some unmapped backend explosion"),
      "auth.generic",
    );
    strictEqual(authErrorKey(undefined), "auth.generic");
    strictEqual(authErrorKey(null), "auth.generic");
    strictEqual(authErrorKey(42), "auth.generic");
  });
});
