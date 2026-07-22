// Desktop sign-in orchestration: drive the loopback/PKCE authorize + the GCIP
// REST exchange, and assemble a `SignInOutcome` (the app's `Session` + GCIP's
// account-created flag). auth.ts calls these on the `osIsTauri()` branch; the
// web branch uses firebase-js-sdk instead. Kept beside the identity REST
// modules (not in auth.ts) so auth.ts stays a thin dispatcher.

import { authorizeAppleDesktop } from "./apple-authorize.ts";
import { identityConfig } from "./config.ts";
import type { LoopbackAuthorizeOptions } from "./desktop-oauth.ts";
import { IdentityError } from "./errors.ts";
import {
  signInWithCustomToken,
  signInWithIdp,
  signInWithIdpSession,
} from "./firebase-rest.ts";
import { authorizeGoogleDesktop } from "./google-authorize.ts";
import { decodeIdTokenClaims } from "./id-token.ts";
import { authorizeMicrosoftDesktop } from "./microsoft-authorize.ts";
import type { SignInOutcome } from "./session.ts";
import { sessionFromCustomToken, sessionFromIdp } from "./session-from-idp.ts";

/**
 * Google: loopback id_token → `signInWithIdp` → SignInOutcome (provider
 * "google.com"). Returns `null` when the loopback authorize was benignly
 * cancelled.
 */
export async function googleDesktopSession(
  opts?: LoopbackAuthorizeOptions,
): Promise<SignInOutcome | null> {
  const idToken = await authorizeGoogleDesktop(opts);
  if (idToken === null) return null; // benign cancel
  const result = await signInWithIdp({
    apiKey: identityConfig.apiKey,
    providerId: "google.com",
    idToken,
  });
  return {
    session: sessionFromIdp(result, "google.com"),
    isNewUser: result.isNewUser,
  };
}

/**
 * Microsoft: loopback tokens → `signInWithIdp` → SignInOutcome (provider
 * "microsoft.com"). Returns `null` when the loopback authorize was benignly
 * cancelled.
 */
export async function microsoftDesktopSession(
  opts?: LoopbackAuthorizeOptions,
): Promise<SignInOutcome | null> {
  const authorized = await authorizeMicrosoftDesktop(opts);
  if (authorized === null) return null; // benign cancel
  const { idToken, accessToken } = authorized;
  const result = await signInWithIdp({
    apiKey: identityConfig.apiKey,
    providerId: "microsoft.com",
    idToken,
    accessToken,
  });
  return {
    session: sessionFromIdp(result, "microsoft.com"),
    isNewUser: result.isNewUser,
  };
}

/**
 * Apple: GCIP-brokered loopback (`createAuthUri` → handler → loopback) →
 * `signInWithIdpSession` → SignInOutcome (provider "apple.com"). Returns `null`
 * when the authorize was benignly cancelled.
 */
export async function appleDesktopSession(
  opts?: LoopbackAuthorizeOptions,
): Promise<SignInOutcome | null> {
  const authorized = await authorizeAppleDesktop(opts);
  if (authorized === null) return null; // benign cancel
  const result = await signInWithIdpSession({
    apiKey: identityConfig.apiKey,
    requestUri: authorized.requestUri,
    sessionId: authorized.sessionId,
  });
  return {
    session: sessionFromIdp(result, "apple.com"),
    isNewUser: result.isNewUser,
  };
}

/** Email OTP: gateway custom token → REST exchange → outcome from decoded claims. */
export async function customTokenDesktopSession(
  customToken: string,
): Promise<SignInOutcome> {
  const tokens = await signInWithCustomToken({
    apiKey: identityConfig.apiKey,
    customToken,
  });
  const claims = decodeIdTokenClaims(tokens.idToken);
  if (!claims) throw new IdentityError("malformed_response");
  return {
    session: sessionFromCustomToken(tokens, claims),
    isNewUser: tokens.isNewUser,
  };
}
