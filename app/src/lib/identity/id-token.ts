// Decode a Firebase ID token's claims WITHOUT verifying its signature.
//
// The client never verifies (the gateway does, against Google's JWKS). We only
// read claims the REST response omits: `accounts:signInWithCustomToken` (the
// email-OTP path) returns an idToken + refreshToken but NO uid/email, so Wave 2
// reads `sub` / `email` / `email_verified` / `name` from the token to assemble
// a `Session`. Decode-only, shape-tolerant: a malformed token yields `null` +
// a structured log, never a throw.

import { identityLog } from "./log.ts";

export interface IdTokenClaims {
  /** Firebase UID. */
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  /** `firebase.sign_in_provider`, e.g. "custom", "google.com". */
  firebase?: { sign_in_provider?: string };
  /** Expiry, epoch SECONDS (JWT convention). */
  exp?: number;
}

function base64UrlDecode(segment: string): string {
  const pad =
    segment.length % 4 === 0 ? "" : "=".repeat(4 - (segment.length % 4));
  const base64 = segment.replace(/-/g, "+").replace(/_/g, "/") + pad;
  // `atob` exists in the webview and in modern Node; both are used at runtime.
  const binary = atob(base64);
  // Reconstruct UTF-8 from the byte string atob produced.
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Decode (not verify) an ID token's payload. Returns `null` if malformed. */
export function decodeIdTokenClaims(idToken: string): IdTokenClaims | null {
  const payload = idToken.split(".")[1];
  if (!payload) {
    identityLog(
      "warn",
      "ID token has no payload segment, cannot decode claims",
      "identity/id-token",
    );
    return null;
  }
  let claims: unknown;
  try {
    claims = JSON.parse(base64UrlDecode(payload));
  } catch (e) {
    identityLog(
      "warn",
      `failed to decode ID token claims: ${String(e)}`,
      "identity/id-token",
    );
    return null;
  }
  if (
    typeof claims !== "object" ||
    claims === null ||
    typeof (claims as Record<string, unknown>).sub !== "string"
  ) {
    identityLog(
      "warn",
      "ID token claims missing a string `sub`, treating as invalid",
      "identity/id-token",
    );
    return null;
  }
  return claims as IdTokenClaims;
}
