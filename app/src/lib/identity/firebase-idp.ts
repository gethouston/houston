import { IdentityError } from "./errors.ts";
import { expiresAtFrom, reqString } from "./firebase-rest.ts";
import { IDENTITY_TOOLKIT_BASE, postGcipJson } from "./rest-client.ts";

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
  isNewUser: boolean;
}

export interface IdpNeedConfirmation {
  providerId: IdpProviderId;
  email: string | null;
  localId: string | null;
  oauthIdToken: string | null;
  oauthAccessToken: string | null;
  pendingToken: string | null;
}

export type IdpExchange =
  | { kind: "signed_in"; result: IdpSignInResult }
  | { kind: "need_confirmation"; confirmation: IdpNeedConfirmation };

export type IdpCredential = { pendingToken: string } | { postBody: string };

const text = (body: Record<string, unknown>, key: string): string | null =>
  typeof body[key] === "string" && body[key] ? (body[key] as string) : null;

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
      localId: text(body, "localId"),
      oauthIdToken: text(body, "oauthIdToken"),
      oauthAccessToken: text(body, "oauthAccessToken"),
      pendingToken: text(body, "pendingToken"),
    },
  };
}

const signInWithIdpUrl = (apiKey: string) =>
  `${IDENTITY_TOOLKIT_BASE}/accounts:signInWithIdp?key=${apiKey}`;

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

export async function linkIdpToSession(params: {
  apiKey: string;
  idToken: string;
  providerId: IdpProviderId;
  credential: IdpCredential;
}): Promise<IdpSignInResult> {
  const body = await postGcipJson(signInWithIdpUrl(params.apiKey), {
    idToken: params.idToken,
    ...params.credential,
    requestUri: "http://localhost",
    returnSecureToken: true,
    returnIdpCredential: true,
  });
  return signInResult(body, params.providerId);
}
