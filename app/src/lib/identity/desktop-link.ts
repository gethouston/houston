// The desktop half of the account-exists link. GCIP answered a provider
// sign-in with `needConfirmation`, so its credential waits here, in memory
// only, until the SDK's identity flow holds a session an email code minted.

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

/**
 * Hold the credential GCIP would not sign in, and name the address the
 * provider asserted. GCIP drops `email` under email enumeration protection,
 * so the provider's own ID token is read next. `googleIdToken` is the token
 * the desktop got from Google directly, the one provider it talks to itself.
 */
export function holdNeedConfirmation(
  confirmation: IdpNeedConfirmation,
  googleIdToken?: string,
): PendingLink {
  const { providerId, oauthIdToken, oauthAccessToken, pendingToken } =
    confirmation;
  const postBody = googleIdToken
    ? idpPostBody(providerId, googleIdToken, null)
    : idpPostBody(providerId, oauthIdToken, oauthAccessToken);
  if (!postBody && !pendingToken) throw new IdentityError("malformed_response");
  const handle = newPendingLinkHandle();
  held.set(handle, { providerId, credential: { postBody, pendingToken } });
  return {
    kind: "link_required",
    provider: providerId,
    email:
      confirmation.email ??
      emailOf(oauthIdToken) ??
      emailOf(googleIdToken ?? null),
    handle,
  };
}

export function discardDesktopCredential(handle: PendingLinkHandle): void {
  held.delete(handle);
}

/** Link the held credential onto `session`, the one the email code minted. */
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
    if (!isIdentityError(error)) throw error;
    if (error.code === "identity_already_linked")
      return { kind: "identity_taken" };
    if (error.code === "invalid_idp_response") return { kind: "expired" };
    throw error;
  }
}
