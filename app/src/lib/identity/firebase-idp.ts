// GCIP federated sign-in over REST: the desktop's Google, Microsoft and Apple
// exchanges (web and mobile use firebase-js-sdk). An exchange either signs in
// or, when the provider's email already belongs to an account GCIP will not
// link on its own, answers `needConfirmation` with what a later link needs.

import { IdentityError } from "./errors.ts";
import { expiresAtFrom, reqString } from "./firebase-rest.ts";
import { IDENTITY_TOOLKIT_BASE, postGcipJson } from "./rest-client.ts";

/** Federated provider ids GCIP `signInWithIdp` accepts here. */
export type IdpProviderId = "google.com" | "microsoft.com" | "apple.com";

const IDP_PROVIDERS: readonly string[] = [
  "google.com",
  "microsoft.com",
  "apple.com",
] satisfies IdpProviderId[];

export interface IdpSignInResult {
  idToken: string;
  refreshToken: string;
  expiresAt: number;
  uid: string;
  email: string;
  emailVerified: boolean;
  displayName: string | null;
  photoUrl: string | null;
  providerId: string;
  /** True when THIS exchange created the GCIP account (first sign-in ever). */
  isNewUser: boolean;
}

/**
 * GCIP's answer when the provider's email already belongs to an account: no
 * session. `email` is absent when email enumeration protection strips it.
 */
export interface IdpNeedConfirmation {
  providerId: IdpProviderId;
  email: string | null;
  oauthIdToken: string | null;
  oauthAccessToken: string | null;
  /** Prod GCIP's replayable handle on the provider sign-in, when it sends one. */
  pendingToken: string | null;
}

export type IdpExchange =
  | { kind: "signed_in"; result: IdpSignInResult }
  | { kind: "need_confirmation"; confirmation: IdpNeedConfirmation };

/** A provider credential `signInWithIdp` can replay. GCIP prefers the token. */
export interface IdpCredential {
  postBody: string | null;
  pendingToken: string | null;
}

const text = (body: Record<string, unknown>, key: string): string | null =>
  typeof body[key] === "string" && body[key] ? (body[key] as string) : null;

/** The `postBody` GCIP reads a provider's OIDC / OAuth tokens from. */
export function idpPostBody(
  providerId: IdpProviderId,
  idToken: string | null,
  accessToken: string | null,
): string | null {
  if (!idToken && !accessToken) return null;
  const body = new URLSearchParams({ providerId });
  if (idToken) body.set("id_token", idToken);
  if (accessToken) body.set("access_token", accessToken);
  return body.toString();
}

function signInResult(
  body: Record<string, unknown>,
  providerId: string,
): IdpSignInResult {
  return {
    idToken: reqString(body, "idToken"),
    refreshToken: reqString(body, "refreshToken"),
    expiresAt: expiresAtFrom(body, "expiresIn"),
    uid: reqString(body, "localId"),
    email: text(body, "email") ?? "",
    emailVerified: body.emailVerified === true,
    displayName: text(body, "displayName"),
    photoUrl: text(body, "photoUrl"),
    providerId: text(body, "providerId") ?? providerId,
    isNewUser: body.isNewUser === true,
  };
}

function exchangeFrom(
  body: Record<string, unknown>,
  providerId: string,
): IdpExchange {
  if (body.needConfirmation !== true)
    return { kind: "signed_in", result: signInResult(body, providerId) };
  const confirmed = text(body, "providerId") ?? providerId;
  if (!IDP_PROVIDERS.includes(confirmed))
    throw new IdentityError("malformed_response");
  return {
    kind: "need_confirmation",
    confirmation: {
      providerId: confirmed as IdpProviderId,
      email: text(body, "email"),
      oauthIdToken: text(body, "oauthIdToken"),
      oauthAccessToken: text(body, "oauthAccessToken"),
      pendingToken: text(body, "pendingToken"),
    },
  };
}

const signInWithIdpUrl = (apiKey: string) =>
  `${IDENTITY_TOOLKIT_BASE}/accounts:signInWithIdp?key=${apiKey}`;

/** Federated sign-in. Supply an OIDC `idToken` and/or OAuth `accessToken`. */
export async function signInWithIdp(params: {
  apiKey: string;
  providerId: IdpProviderId;
  idToken?: string;
  accessToken?: string;
  requestUri?: string;
}): Promise<IdpExchange> {
  const postBody = idpPostBody(
    params.providerId,
    params.idToken ?? null,
    params.accessToken ?? null,
  );
  if (!postBody) throw new IdentityError("invalid_idp_response");
  const body = await postGcipJson(signInWithIdpUrl(params.apiKey), {
    postBody,
    requestUri: params.requestUri ?? "http://localhost",
    returnSecureToken: true,
    returnIdpCredential: true,
  });
  return exchangeFrom(body, params.providerId);
}

/**
 * Session-based federated sign-in completion, the second half of the
 * GCIP-BROKERED flows (Apple via the gateway deep-link bridge, Microsoft via
 * the loopback): `createAuthUri` minted the authorize URL and a
 * `sessionId`; after the provider bounced through GCIP's handler back to the
 * loopback `continueUri`, the FULL callback URL goes back as `requestUri` and
 * GCIP redeems the pair itself — no provider token exchange on the client, no
 * provider secret anywhere near it.
 */
export async function signInWithIdpSession(params: {
  apiKey: string;
  requestUri: string;
  sessionId: string;
}): Promise<IdpExchange> {
  const body = await postGcipJson(signInWithIdpUrl(params.apiKey), {
    requestUri: params.requestUri,
    sessionId: params.sessionId,
    returnSecureToken: true,
    returnIdpCredential: true,
  });
  return exchangeFrom(body, "");
}

/**
 * Link a provider credential onto the account behind `idToken`. GCIP answers
 * with fresh tokens for that account, now carrying the provider, even when
 * the provider's email differs from the account's: the caller guards that.
 * An identity that already belongs to an account (this one or another)
 * throws `identity_already_linked`.
 */
export async function linkIdpToSession(params: {
  apiKey: string;
  idToken: string;
  providerId: IdpProviderId;
  credential: IdpCredential;
}): Promise<IdpSignInResult> {
  const { postBody, pendingToken } = params.credential;
  if (!postBody && !pendingToken)
    throw new IdentityError("invalid_idp_response");
  const body = await postGcipJson(signInWithIdpUrl(params.apiKey), {
    idToken: params.idToken,
    ...(postBody ? { postBody } : {}),
    ...(pendingToken ? { pendingToken } : {}),
    requestUri: "http://localhost",
    returnSecureToken: true,
    returnIdpCredential: true,
  });
  return signInResult(body, params.providerId);
}
