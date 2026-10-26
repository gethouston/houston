// Typed GCIP REST wrappers — the desktop's Firebase Auth client (the web +
// admin surfaces use firebase-js-sdk instead; see MIGRATION-DESIGN §2). The
// federated calls live in firebase-idp.ts. All `fetch`, all throwing typed
// `IdentityError` on failure:
//
//   createAuthUri        — authorize URL for the brokered Apple/Microsoft flows
//   signInWithPassword   — admin email+password
//   signInWithCustomToken— email-OTP final exchange (gateway-minted token)
//   refreshIdToken       — rehydrate/refresh via securetoken.googleapis.com
//
// Every wrapper normalizes the raw GCIP JSON into a stable result: `expiresIn`
// (seconds string) → absolute `expiresAt` (epoch ms), snake_case → camelCase,
// and validates required fields (missing → `malformed_response`).

import { IdentityError } from "./errors.ts";
import type { IdpProviderId } from "./firebase-idp.ts";
import {
  IDENTITY_TOOLKIT_BASE,
  postGcipForm,
  postGcipJson,
  SECURE_TOKEN_BASE,
} from "./rest-client.ts";

export interface PasswordSignInResult {
  idToken: string;
  refreshToken: string;
  expiresAt: number;
  uid: string;
  email: string;
}

/** Custom-token exchange returns no profile — decode the idToken for uid/email. */
export interface TokenSignInResult {
  idToken: string;
  refreshToken: string;
  expiresAt: number;
}

/** Custom-token exchange tokens + GCIP's account-creation flag. */
export interface CustomTokenSignInResult extends TokenSignInResult {
  /** True when THIS exchange created the GCIP account (first sign-in ever). */
  isNewUser: boolean;
}

export function reqString(
  obj: Record<string, unknown>,
  key: string,
  httpStatus = 200,
): string {
  const v = obj[key];
  if (typeof v !== "string" || v.length === 0) {
    throw new IdentityError("malformed_response", { httpStatus });
  }
  return v;
}

/** `expiresIn` arrives as a seconds STRING; convert to an absolute epoch-ms. */
export function expiresAtFrom(
  obj: Record<string, unknown>,
  key: string,
): number {
  const raw = obj[key];
  const seconds = typeof raw === "string" ? Number(raw) : Number.NaN;
  if (!Number.isFinite(seconds)) {
    throw new IdentityError("malformed_response");
  }
  return Date.now() + seconds * 1000;
}

/**
 * Mint a provider authorize URL through GCIP (`accounts:createAuthUri`) for the
 * brokered desktop flows: GCIP builds the URL, carrying its own CSRF `state`,
 * and returns the `sessionId` that later pairs with the callback in
 * {@link signInWithIdpSession}. `continueUri` is passed to the provider
 * VERBATIM as `redirect_uri` (GCIP does NOT bounce through its `/__/auth`
 * handler), so it must be a redirect URI registered on the provider's app —
 * Apple's gateway bridge, or Microsoft's `http://localhost:<port>` loopback.
 */
export async function createAuthUri(params: {
  apiKey: string;
  providerId: IdpProviderId;
  continueUri: string;
  /** Space-delimited extra OAuth scopes (e.g. Apple's `name email`). */
  oauthScope?: string;
}): Promise<{ authUri: string; sessionId: string }> {
  const body = await postGcipJson(
    `${IDENTITY_TOOLKIT_BASE}/accounts:createAuthUri?key=${params.apiKey}`,
    {
      providerId: params.providerId,
      continueUri: params.continueUri,
      ...(params.oauthScope ? { oauthScope: params.oauthScope } : {}),
    },
  );
  return {
    authUri: reqString(body, "authUri"),
    sessionId: reqString(body, "sessionId"),
  };
}

/** Admin email + password sign-in. */
export async function signInWithPassword(params: {
  apiKey: string;
  email: string;
  password: string;
}): Promise<PasswordSignInResult> {
  const body = await postGcipJson(
    `${IDENTITY_TOOLKIT_BASE}/accounts:signInWithPassword?key=${params.apiKey}`,
    { email: params.email, password: params.password, returnSecureToken: true },
  );
  return {
    idToken: reqString(body, "idToken"),
    refreshToken: reqString(body, "refreshToken"),
    expiresAt: expiresAtFrom(body, "expiresIn"),
    uid: reqString(body, "localId"),
    email: typeof body.email === "string" ? body.email : params.email,
  };
}

/** Exchange a gateway-minted custom token (email-OTP flow) for a session. */
export async function signInWithCustomToken(params: {
  apiKey: string;
  customToken: string;
}): Promise<CustomTokenSignInResult> {
  const body = await postGcipJson(
    `${IDENTITY_TOOLKIT_BASE}/accounts:signInWithCustomToken?key=${params.apiKey}`,
    { token: params.customToken, returnSecureToken: true },
  );
  return {
    idToken: reqString(body, "idToken"),
    refreshToken: reqString(body, "refreshToken"),
    expiresAt: expiresAtFrom(body, "expiresIn"),
    isNewUser: body.isNewUser === true,
  };
}

/** Refresh (or rehydrate across launches) via securetoken. Snake_case body. */
export async function refreshIdToken(params: {
  apiKey: string;
  refreshToken: string;
}): Promise<TokenSignInResult> {
  const body = await postGcipForm(
    `${SECURE_TOKEN_BASE}/token?key=${params.apiKey}`,
    {
      grant_type: "refresh_token",
      refresh_token: params.refreshToken,
    },
  );
  return {
    idToken: reqString(body, "id_token"),
    refreshToken: reqString(body, "refresh_token"),
    expiresAt: expiresAtFrom(body, "expires_in"),
  };
}

/**
 * Set the ACCOUNT RECORD's display profile (GCIP `accounts:update`). GCIP mints
 * the `name`/`picture` ID-token claims from the account record, not from the
 * federated identity, so a record created photo-less signs in with tokens that
 * carry no `picture` — and the gateway, which trusts the token, serves initials
 * to every teammate. Called by the sign-in completions to backfill the record
 * from the provider identity; `returnSecureToken` hands back fresh tokens that
 * already carry the new claims.
 */
export async function updateAccountProfile(params: {
  apiKey: string;
  idToken: string;
  displayName?: string;
  photoUrl?: string;
}): Promise<TokenSignInResult> {
  const body = await postGcipJson(
    `${IDENTITY_TOOLKIT_BASE}/accounts:update?key=${params.apiKey}`,
    {
      idToken: params.idToken,
      ...(params.displayName ? { displayName: params.displayName } : {}),
      ...(params.photoUrl ? { photoUrl: params.photoUrl } : {}),
      returnSecureToken: true,
    },
  );
  return {
    idToken: reqString(body, "idToken"),
    refreshToken: reqString(body, "refreshToken"),
    expiresAt: expiresAtFrom(body, "expiresIn"),
  };
}
