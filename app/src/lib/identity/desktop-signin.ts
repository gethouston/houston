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
    console.error("account profile backfill failed", e);
    return result;
  }
}

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

export async function googleDesktopSession(
  opts?: LoopbackAuthorizeOptions,
): Promise<DesktopSignIn | null> {
  const idToken = await authorizeGoogleDesktop(opts);
  if (idToken === null) return null;
  const exchange = await signInWithIdp({
    apiKey: identityConfig.apiKey,
    providerId: "google.com",
    idToken,
  });
  return settle(exchange, "google.com", idToken);
}

export async function microsoftDesktopSession(
  opts?: LoopbackAuthorizeOptions,
): Promise<DesktopSignIn | null> {
  const authorized = await authorizeMicrosoftDesktop(opts);
  if (authorized === null) return null;
  const exchange = await signInWithIdpSession({
    apiKey: identityConfig.apiKey,
    requestUri: authorized.requestUri,
    sessionId: authorized.sessionId,
  });
  return settle(exchange, "microsoft.com");
}

export async function appleDesktopSession(
  opts?: LoopbackAuthorizeOptions,
): Promise<DesktopSignIn | null> {
  const authorized = await authorizeAppleDesktop(opts);
  if (authorized === null) return null;
  const exchange = await signInWithIdpSession({
    apiKey: identityConfig.apiKey,
    requestUri: authorized.requestUri,
    sessionId: authorized.sessionId,
  });
  return settle(exchange, "apple.com");
}

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
