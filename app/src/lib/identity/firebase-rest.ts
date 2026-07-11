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
export type IdpProviderId = "google.com" | "microsoft.com";

export interface IdpSignInResult {
  idToken: string;
  refreshToken: string;
  expiresAt: number;
  uid: string;
  email: string;
  emailVerified: boolean;
  displayName: string | null;
  providerId: string;
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
    providerId:
      typeof body.providerId === "string" ? body.providerId : params.providerId,
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
}): Promise<TokenSignInResult> {
  const body = await postGcipJson(
    `${IDENTITY_TOOLKIT_BASE}/accounts:signInWithCustomToken?key=${params.apiKey}`,
    { token: params.customToken, returnSecureToken: true },
  );
  return {
    idToken: reqString(body, "idToken"),
    refreshToken: reqString(body, "refreshToken"),
    expiresAt: expiresAtFrom(body, "expiresIn"),
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
