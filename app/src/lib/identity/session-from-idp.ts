// Pure mappers: assemble the app's identity `Session` from the two desktop REST
// sign-in shapes.
//
//   • `sessionFromIdp` — a federated `IdpSignInResult` (Google / Microsoft),
//     which already carries the full profile.
//   • `sessionFromCustomToken` — the email-OTP path: `signInWithCustomToken`
//     returns only tokens (no profile), so the profile is read from the decoded
//     ID token claims (`decodeIdTokenClaims`).
//
// No I/O, no globals — unit-tested in app/tests/auth-session-map.test.ts.

import type { IdpSignInResult, TokenSignInResult } from "./firebase-rest.ts";
import type { IdTokenClaims } from "./id-token.ts";
import type { AuthProvider, Session } from "./session.ts";

/** Federated result → Session. `provider` records which button minted it. */
export function sessionFromIdp(
  result: IdpSignInResult,
  provider: AuthProvider,
): Session {
  return {
    idToken: result.idToken,
    refreshToken: result.refreshToken,
    uid: result.uid,
    email: result.email,
    emailVerified: result.emailVerified,
    displayName: result.displayName,
    photoUrl: result.photoUrl,
    provider,
    expiresAt: result.expiresAt,
  };
}

/** Custom-token tokens + decoded claims → Session (provider "custom"). */
export function sessionFromCustomToken(
  tokens: TokenSignInResult,
  claims: IdTokenClaims,
): Session {
  return {
    idToken: tokens.idToken,
    refreshToken: tokens.refreshToken,
    uid: claims.sub,
    email: claims.email ?? "",
    emailVerified: claims.email_verified ?? false,
    displayName: claims.name ?? null,
    photoUrl: claims.picture ?? null,
    provider: "custom",
    expiresAt: tokens.expiresAt,
  };
}
