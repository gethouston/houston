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

export interface TokenSignInResult {
  idToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface CustomTokenSignInResult extends TokenSignInResult {
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

export async function createAuthUri(params: {
  apiKey: string;
  providerId: IdpProviderId;
  continueUri: string;
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
