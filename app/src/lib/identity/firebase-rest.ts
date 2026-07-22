// Typed GCIP REST wrappers — the desktop's Firebase Auth client (the web +
// admin surfaces use firebase-js-sdk instead; see MIGRATION-DESIGN §2). Four
// calls, all `fetch`, all throwing typed `IdentityError` on failure:
//
//   signInWithIdp        — federated sign-in (Google / Microsoft), generic
//   signInWithPassword   — admin email+password
//   signInWithCustomToken— email-OTP final exchange (gateway-minted token)
//   refreshIdToken       — rehydrate/refresh via securetoken.googleapis.com
//
// Every wrapper normalizes the raw GCIP JSON into a stable result: `expiresIn`
// (seconds string) → absolute `expiresAt` (epoch ms), snake_case → camelCase,
// and validates required fields (missing → `malformed_response`).

import { IdentityError } from "./errors.ts";
import {
  IDENTITY_TOOLKIT_BASE,
  postGcipForm,
  postGcipJson,
  SECURE_TOKEN_BASE,
} from "./rest-client.ts";

/** Federated provider ids GCIP `signInWithIdp` accepts here. */
export type IdpProviderId = "google.com" | "microsoft.com" | "apple.com";

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

function reqString(
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
function expiresAtFrom(obj: Record<string, unknown>, key: string): number {
  const raw = obj[key];
  const seconds = typeof raw === "string" ? Number(raw) : Number.NaN;
  if (!Number.isFinite(seconds)) {
    throw new IdentityError("malformed_response");
  }
  return Date.now() + seconds * 1000;
}

/** Federated sign-in. Supply an OIDC `idToken` and/or OAuth `accessToken`. */
export async function signInWithIdp(params: {
  apiKey: string;
  providerId: IdpProviderId;
  idToken?: string;
  accessToken?: string;
  requestUri?: string;
}): Promise<IdpSignInResult> {
  const cred = new URLSearchParams({ providerId: params.providerId });
  if (params.idToken) cred.set("id_token", params.idToken);
  if (params.accessToken) cred.set("access_token", params.accessToken);
  if (!params.idToken && !params.accessToken) {
    throw new IdentityError("invalid_idp_response");
  }
  const body = await postGcipJson(
    `${IDENTITY_TOOLKIT_BASE}/accounts:signInWithIdp?key=${params.apiKey}`,
    {
      postBody: cred.toString(),
      requestUri: params.requestUri ?? "http://localhost",
      returnSecureToken: true,
      returnIdpCredential: true,
    },
  );
  return {
    idToken: reqString(body, "idToken"),
    refreshToken: reqString(body, "refreshToken"),
    expiresAt: expiresAtFrom(body, "expiresIn"),
    uid: reqString(body, "localId"),
    email: typeof body.email === "string" ? body.email : "",
    emailVerified: body.emailVerified === true,
    displayName: typeof body.displayName === "string" ? body.displayName : null,
    photoUrl: typeof body.photoUrl === "string" ? body.photoUrl : null,
    providerId:
      typeof body.providerId === "string" ? body.providerId : params.providerId,
    isNewUser: body.isNewUser === true,
  };
}

/**
 * Session-based federated sign-in completion, the second half of the
 * GCIP-BROKERED flow (Apple): `createAuthUri` minted the authorize URL and a
 * `sessionId`; after the provider bounced through GCIP's handler back to the
 * loopback `continueUri`, the FULL callback URL goes back as `requestUri` and
 * GCIP redeems the pair itself — no provider token exchange on the client, no
 * provider secret anywhere near it.
 */
export async function signInWithIdpSession(params: {
  apiKey: string;
  requestUri: string;
  sessionId: string;
}): Promise<IdpSignInResult> {
  const body = await postGcipJson(
    `${IDENTITY_TOOLKIT_BASE}/accounts:signInWithIdp?key=${params.apiKey}`,
    {
      requestUri: params.requestUri,
      sessionId: params.sessionId,
      returnSecureToken: true,
      returnIdpCredential: true,
    },
  );
  return {
    idToken: reqString(body, "idToken"),
    refreshToken: reqString(body, "refreshToken"),
    expiresAt: expiresAtFrom(body, "expiresIn"),
    uid: reqString(body, "localId"),
    email: typeof body.email === "string" ? body.email : "",
    emailVerified: body.emailVerified === true,
    displayName: typeof body.displayName === "string" ? body.displayName : null,
    photoUrl: typeof body.photoUrl === "string" ? body.photoUrl : null,
    providerId: typeof body.providerId === "string" ? body.providerId : "",
    isNewUser: body.isNewUser === true,
  };
}

/**
 * Mint a provider authorize URL through GCIP (`accounts:createAuthUri`) for the
 * brokered desktop flow: GCIP builds the URL (its handler is the redirect the
 * provider is registered with) and returns the `sessionId` that later pairs
 * with the callback in {@link signInWithIdpSession}. `continueUri` is where
 * GCIP's handler bounces the browser after the provider consents — the desktop
 * loopback (must be an authorized domain on the identity project).
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
