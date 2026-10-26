// Desktop sign-in orchestration: drive the loopback/PKCE authorize + the GCIP
// REST exchange, and assemble a `SignInOutcome` (the app's `Session` + GCIP's
// account-created flag), or a `PendingLink` when the provider's email already
// belongs to an account. auth.ts calls these on the `osIsTauri()` branch; the
// web branch uses firebase-js-sdk instead. Kept beside the identity REST
// modules (not in auth.ts) so auth.ts stays a thin dispatcher.

import type { PendingLink } from "@houston/sdk/identity";
import { authorizeAppleDesktop } from "./apple-authorize.ts";
import { identityConfig } from "./config.ts";
import { holdNeedConfirmation } from "./desktop-link.ts";
import type { LoopbackAuthorizeOptions } from "./desktop-oauth.ts";
import { IdentityError } from "./errors.ts";
import {
  type IdpExchange,
  type IdpProviderId,
  type IdpSignInResult,
  signInWithIdp,
  signInWithIdpSession,
} from "./firebase-idp.ts";
import {
  signInWithCustomToken,
  updateAccountProfile,
} from "./firebase-rest.ts";
import { authorizeGoogleDesktop } from "./google-authorize.ts";
import { decodeIdTokenClaims } from "./id-token.ts";
import { authorizeMicrosoftDesktop } from "./microsoft-authorize.ts";
import type { SignInOutcome } from "./session.ts";
import { sessionFromCustomToken, sessionFromIdp } from "./session-from-idp.ts";

/**
 * Backfill the GCIP account record from the provider identity when the record
 * lacks a photo or name (the token claims are minted from the RECORD, so
 * without this the gateway never learns the photo and teammates see initials
 * forever). Best-effort: on failure the original result stands. On success the
 * refreshed tokens (which already carry the new claims) replace the originals,
 * so the first gateway request after sign-in serves the photo.
 */
async function withProfileBackfill(
  result: IdpSignInResult,
): Promise<IdpSignInResult> {
  const claims = decodeIdTokenClaims(result.idToken);
  const wantsPhoto = !claims?.picture && !!result.photoUrl;
  const wantsName = !claims?.name && !!result.displayName;
  if (!wantsPhoto && !wantsName) return result;
  try {
    const refreshed = await updateAccountProfile({
      apiKey: identityConfig.apiKey,
      idToken: result.idToken,
      ...(wantsPhoto ? { photoUrl: result.photoUrl ?? undefined } : {}),
      ...(wantsName ? { displayName: result.displayName ?? undefined } : {}),
    });
    return { ...result, ...refreshed };
  } catch (e) {
    // Cosmetic identity only — the sign-in itself succeeded. Log for /debug.
    console.error("account profile backfill failed", e);
    return result;
  }
}

/** What a provider sign-in came to: a session, or an account to link onto. */
export type DesktopSignIn = SignInOutcome | PendingLink;

async function settle(
  exchange: IdpExchange,
  provider: IdpProviderId,
  googleIdToken?: string,
): Promise<DesktopSignIn> {
  if (exchange.kind === "need_confirmation")
    return holdNeedConfirmation(exchange.confirmation, googleIdToken);
  const { result } = exchange;
  return {
    session: sessionFromIdp(await withProfileBackfill(result), provider),
    isNewUser: result.isNewUser,
  };
}

/**
 * Google: loopback id_token → `signInWithIdp`. Returns `null` when the
 * loopback authorize was benignly cancelled.
 */
export async function googleDesktopSession(
  opts?: LoopbackAuthorizeOptions,
): Promise<DesktopSignIn | null> {
  const idToken = await authorizeGoogleDesktop(opts);
  if (idToken === null) return null; // benign cancel
  const exchange = await signInWithIdp({
    apiKey: identityConfig.apiKey,
    providerId: "google.com",
    idToken,
  });
  return settle(exchange, "google.com", idToken);
}

/**
 * Microsoft: GCIP-brokered loopback (`createAuthUri` → loopback → GCIP redeems
 * the code server-side) → `signInWithIdpSession`. Brokered because neither
 * Entra nor GCIP accepts a client-side Microsoft token exchange (see
 * microsoft-authorize.ts). Returns `null` when the authorize was benignly
 * cancelled.
 */
export async function microsoftDesktopSession(
  opts?: LoopbackAuthorizeOptions,
): Promise<DesktopSignIn | null> {
  const authorized = await authorizeMicrosoftDesktop(opts);
  if (authorized === null) return null; // benign cancel
  const exchange = await signInWithIdpSession({
    apiKey: identityConfig.apiKey,
    requestUri: authorized.requestUri,
    sessionId: authorized.sessionId,
  });
  return settle(exchange, "microsoft.com");
}

/**
 * Apple: GCIP-brokered loopback (`createAuthUri` → handler → loopback) →
 * `signInWithIdpSession`. Returns `null` when the authorize was benignly
 * cancelled.
 */
export async function appleDesktopSession(
  opts?: LoopbackAuthorizeOptions,
): Promise<DesktopSignIn | null> {
  const authorized = await authorizeAppleDesktop(opts);
  if (authorized === null) return null; // benign cancel
  const exchange = await signInWithIdpSession({
    apiKey: identityConfig.apiKey,
    requestUri: authorized.requestUri,
    sessionId: authorized.sessionId,
  });
  return settle(exchange, "apple.com");
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
