import type { Session, SignInOutcome } from "@houston/app/lib/identity";
import type { PendingLink } from "@houston/sdk/identity";
import type { LinkProvider } from "@houston/wire-types";
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
import { holdAccountExists, isAccountExists } from "./firebase-link.ts";
import {
  backfillAccountProfile,
  toOutcome,
  toSession,
} from "./firebase-session.ts";

export { initWebAuth } from "./firebase-auth-instance.ts";
export { webDiscardPending, webLinkPending } from "./firebase-link.ts";
export { toSession } from "./firebase-session.ts";

async function popupSignIn(
  provider: GoogleAuthProvider | OAuthProvider,
  id: LinkProvider,
): Promise<SignInOutcome | PendingLink | null> {
  const auth = await ready();
  try {
    const cred = await signInWithPopup(auth, provider);
    await backfillAccountProfile(cred.user);
    return await toOutcome(cred);
  } catch (e) {
    if (isBenignPopupCancel(e)) return null;
    if (isAccountExists(e))
      return holdAccountExists(
        e,
        id,
        id === "google.com"
          ? GoogleAuthProvider.credentialFromError(e)
          : OAuthProvider.credentialFromError(e),
      );
    throw mapFirebaseError(e);
  }
}

export function webSignInWithGoogle(): Promise<
  SignInOutcome | PendingLink | null
> {
  return popupSignIn(new GoogleAuthProvider(), "google.com");
}

export function webSignInWithMicrosoft(): Promise<
  SignInOutcome | PendingLink | null
> {
  return popupSignIn(new OAuthProvider("microsoft.com"), "microsoft.com");
}

export function webSignInWithApple(): Promise<
  SignInOutcome | PendingLink | null
> {
  const provider = new OAuthProvider("apple.com");
  provider.addScope("email");
  provider.addScope("name");
  return popupSignIn(provider, "apple.com");
}

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

export async function webSignOut(): Promise<void> {
  const auth = await ready();
  try {
    await signOut(auth);
  } catch (e) {
    throw mapFirebaseError(e);
  }
}

export function webOnIdTokenChanged(
  cb: (session: Session | null) => void,
): () => void {
  const auth = requireAuth();
  return onIdTokenChanged(auth, async (user) => {
    cb(user ? await toSession(user) : null);
  });
}

export function webCurrentUid(): string | null {
  return requireAuth().currentUser?.uid ?? null;
}

export async function webRefreshIdToken(): Promise<string | null> {
  const user = requireAuth().currentUser;
  return user ? await user.getIdToken(true) : null;
}

export async function webCurrentSession(): Promise<Session | null> {
  const user = requireAuth().currentUser;
  if (!user) return null;
  await backfillAccountProfile(user);
  return await toSession(user);
}
