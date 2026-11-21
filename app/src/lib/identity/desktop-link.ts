import {
  type LinkAttempt,
  newPendingLinkHandle,
  type PendingLink,
  type PendingLinkHandle,
} from "@houston/sdk/identity";
import { identityConfig } from "./config.ts";
import { IdentityError, isIdentityError } from "./errors.ts";
import {
  type IdpCredential,
  type IdpNeedConfirmation,
  type IdpProviderId,
  idpPostBody,
  linkIdpToSession,
} from "./firebase-idp.ts";
import { decodeIdTokenClaims } from "./id-token.ts";
import type { Session } from "./session.ts";
import { sessionFromIdp } from "./session-from-idp.ts";

interface Held {
  providerId: IdpProviderId;
  credential: IdpCredential;
}

const held = new Map<PendingLinkHandle, Held>();

const emailOf = (idToken: string | null): string | null =>
  idToken ? (decodeIdTokenClaims(idToken)?.email ?? null) : null;

export function holdNeedConfirmation(
  confirmation: IdpNeedConfirmation,
  googleIdToken?: string,
): PendingLink {
  const { providerId, oauthIdToken, oauthAccessToken, pendingToken } =
    confirmation;
  const postBody = googleIdToken
    ? idpPostBody(providerId, googleIdToken, null)
    : idpPostBody(providerId, oauthIdToken, oauthAccessToken);
  const credential: IdpCredential | null = pendingToken
    ? { pendingToken }
    : postBody
      ? { postBody }
      : null;
  if (!credential) throw new IdentityError("malformed_response");
  const handle = newPendingLinkHandle();
  held.set(handle, { providerId, credential });
  return {
    kind: "link_required",
    provider: providerId,
    email:
      confirmation.email ??
      emailOf(oauthIdToken) ??
      emailOf(googleIdToken ?? null),
    handle,
    accountId: confirmation.localId,
  };
}

export function discardDesktopCredential(handle: PendingLinkHandle): void {
  held.delete(handle);
}

export async function desktopLinkPending(
  handle: PendingLinkHandle,
  session: Session,
): Promise<LinkAttempt<Session>> {
  const entry = held.get(handle);
  if (!entry) return { kind: "expired" };
  try {
    const result = await linkIdpToSession({
      apiKey: identityConfig.apiKey,
      idToken: session.idToken,
      providerId: entry.providerId,
      credential: entry.credential,
    });
    return {
      kind: "linked",
      session: sessionFromIdp(result, entry.providerId),
    };
  } catch (error) {
    if (isIdentityError(error) && error.code === "identity_already_linked")
      return { kind: "identity_taken" };
    throw error;
  }
}
