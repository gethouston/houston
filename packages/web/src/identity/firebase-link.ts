// The firebase-js-sdk half of the account-exists link, for web and mobile. A
// provider sign-in whose email already belongs to an account fails with
// `auth/account-exists-with-different-credential`; its credential waits here,
// in memory only, until the SDK's identity flow holds a session an email code
// minted.

import { decodeIdTokenClaims, type Session } from "@houston/app/lib/identity";
import {
  type LinkAttempt,
  newPendingLinkHandle,
  type PendingLink,
  type PendingLinkHandle,
} from "@houston/sdk/identity";
import type { LinkProvider } from "@houston/wire-types";
import { FirebaseError } from "firebase/app";
import { linkWithCredential, type OAuthCredential } from "firebase/auth";
import { requireAuth } from "./firebase-auth-instance.ts";
import { mapFirebaseError } from "./firebase-errors.ts";
import { toSession } from "./firebase-session.ts";

const held = new Map<
  PendingLinkHandle,
  { provider: LinkProvider; credential: OAuthCredential }
>();

/** The identity belongs to an account, or this account already has one. */
const IDENTITY_TAKEN: ReadonlySet<string> = new Set([
  "auth/credential-already-in-use",
  "auth/provider-already-linked",
]);

export function isAccountExists(error: unknown): error is FirebaseError {
  return (
    error instanceof FirebaseError &&
    error.code === "auth/account-exists-with-different-credential"
  );
}

/**
 * Hold the credential behind an account-exists refusal and name the address
 * the provider asserted. Without a credential there is nothing to link, so
 * the address is dropped too: the flow then asks for the email code instead.
 */
export function holdAccountExists(
  error: FirebaseError,
  provider: LinkProvider,
  credential: OAuthCredential | null,
): PendingLink {
  const handle = newPendingLinkHandle();
  if (!credential)
    return { kind: "link_required", provider, email: null, handle };
  held.set(handle, { provider, credential });
  const asserted = (error.customData as { email?: unknown } | undefined)?.email;
  const email =
    typeof asserted === "string" && asserted
      ? asserted
      : credential.idToken
        ? (decodeIdTokenClaims(credential.idToken)?.email ?? null)
        : null;
  return { kind: "link_required", provider, email, handle };
}

export function webDiscardPending(handle: PendingLinkHandle): void {
  held.delete(handle);
}

/** Link the held credential onto `session`, the one the email code minted. */
export async function webLinkPending(
  handle: PendingLinkHandle,
  session: Session,
): Promise<LinkAttempt<Session>> {
  const entry = held.get(handle);
  if (!entry) return { kind: "expired" };
  const user = requireAuth().currentUser;
  if (user?.uid !== session.uid)
    throw new Error("the signed-in user is not the email-code session");
  try {
    const linked = await linkWithCredential(user, entry.credential);
    return {
      kind: "linked",
      session: { ...(await toSession(linked.user)), provider: entry.provider },
    };
  } catch (error) {
    if (!(error instanceof FirebaseError)) throw mapFirebaseError(error);
    if (IDENTITY_TAKEN.has(error.code)) return { kind: "identity_taken" };
    if (error.code === "auth/invalid-credential") return { kind: "expired" };
    throw mapFirebaseError(error);
  }
}
