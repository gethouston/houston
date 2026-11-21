import type { IdpSignInResult } from "./firebase-idp.ts";
import type { TokenSignInResult } from "./firebase-rest.ts";
import type { IdTokenClaims } from "./id-token.ts";
import type { AuthProvider, Session } from "./session.ts";

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
