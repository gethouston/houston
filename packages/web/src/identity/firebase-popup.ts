// Web-only Firebase Auth surface (firebase-js-sdk). Loaded ONLY in the web
// bundle, reached through the `@houston/web-identity` Vite alias; the desktop
// bundle resolves the stub (app/src/lib/identity/firebase-popup-stub.ts) and
// never ships firebase-js-sdk (design §6.5 / §2 PLATFORM SPLIT).
//
// The SDK owns persistence + auto-refresh + `onIdTokenChanged`; this module just
// adapts its calls to the app's `Session` shape and `IdentityError` taxonomy so
// web and desktop share one model of "signed in" and one error UI. Every export
// here has an identical-signature counterpart in the desktop stub.

import type { Session, SignInOutcome } from "@houston/app/lib/identity";
import {
  GoogleAuthProvider,
  OAuthProvider,
  onIdTokenChanged,
  signInWithCustomToken,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import { ready, requireAuth } from "./firebase-auth-instance.ts";
import { isBenignPopupCancel, mapFirebaseError } from "./firebase-errors.ts";
import {
  backfillAccountProfile,
  toOutcome,
  toSession,
} from "./firebase-session.ts";

export { initWebAuth } from "./firebase-auth-instance.ts";
export { toSession } from "./firebase-session.ts";

async function popupSignIn(
  provider: GoogleAuthProvider | OAuthProvider,
): Promise<SignInOutcome | null> {
  const auth = await ready();
  try {
    const cred = await signInWithPopup(auth, provider);
    await backfillAccountProfile(cred.user);
    return await toOutcome(cred);
  } catch (e) {
    if (isBenignPopupCancel(e)) return null; // benign cancel: no toast, no-op
    throw mapFirebaseError(e);
  }
}

/** Google popup sign-in. Resolves `null` if the user cancels the popup. */
export function webSignInWithGoogle(): Promise<SignInOutcome | null> {
  return popupSignIn(new GoogleAuthProvider());
}

/** Microsoft (Entra) popup sign-in. Resolves `null` on a cancelled popup. */
export function webSignInWithMicrosoft(): Promise<SignInOutcome | null> {
  return popupSignIn(new OAuthProvider("microsoft.com"));
}

/** Apple popup sign-in. Resolves `null` on a cancelled popup. Apple returns
 *  the user's name/email only on the FIRST consent for this Services ID. */
export function webSignInWithApple(): Promise<SignInOutcome | null> {
  const provider = new OAuthProvider("apple.com");
  provider.addScope("email");
  provider.addScope("name");
  return popupSignIn(provider);
}

/** Exchange a gateway-minted custom token (email-OTP flow) for a session. */
export async function webSignInWithCustomToken(
  token: string,
): Promise<SignInOutcome | null> {
  const auth = await ready();
  try {
    const cred = await signInWithCustomToken(auth, token);
    return await toOutcome(cred);
  } catch (e) {
    throw mapFirebaseError(e);
  }
}

/** Sign out of the SDK session (clears local persistence). */
export async function webSignOut(): Promise<void> {
  const auth = await ready();
  try {
    await signOut(auth);
  } catch (e) {
    throw mapFirebaseError(e);
  }
}

/**
 * Subscribe to SDK id-token changes (sign-in, sign-out, auto-refresh), mapping
 * each to a `Session | null`. Returns the unsubscribe function.
 */
export function webOnIdTokenChanged(
  cb: (session: Session | null) => void,
): () => void {
  const auth = requireAuth();
  return onIdTokenChanged(auth, async (user) => {
    cb(user ? await toSession(user) : null);
  });
}

/** Force-refresh the current id token (the `__HOUSTON_SESSION_REFRESH__` seam). */
export async function webRefreshIdToken(): Promise<string | null> {
  const user = requireAuth().currentUser;
  return user ? await user.getIdToken(true) : null;
}

/**
 * The persisted SDK session right now, or null when the SDK confirms no user.
 * Used on the web boot timeout to resolve a returning user directly instead of
 * blindly falling to signed-out (which flashed the sign-in screen on a slow
 * `onIdTokenChanged`).
 */
export async function webCurrentSession(): Promise<Session | null> {
  const user = requireAuth().currentUser;
  if (!user) return null;
  // Returning users never re-run the popup, so the record backfill (see
  // `backfillAccountProfile`) also runs here — idempotent, writes only when
  // the account record is missing what the provider identity carries.
  await backfillAccountProfile(user);
  return await toSession(user);
}
