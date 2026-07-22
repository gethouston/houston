// Web-only Firebase Auth surface (firebase-js-sdk). Loaded ONLY in the web
// bundle, reached through the `@houston/web-identity` Vite alias; the desktop
// bundle resolves the stub (app/src/lib/identity/firebase-popup-stub.ts) and
// never ships firebase-js-sdk (design §6.5 / §2 PLATFORM SPLIT).
//
// The SDK owns persistence + auto-refresh + `onIdTokenChanged`; this module just
// adapts its calls to the app's `Session` shape and `IdentityError` taxonomy so
// web and desktop share one model of "signed in" and one error UI. Every export
// here has an identical-signature counterpart in the desktop stub.

import {
  type AuthProvider,
  decodeIdTokenClaims,
  IdentityError,
  type Session,
  type SignInOutcome,
} from "@houston/app/lib/identity";
import { initializeApp } from "firebase/app";
import {
  type Auth,
  browserLocalPersistence,
  GoogleAuthProvider,
  getAdditionalUserInfo,
  getAuth,
  OAuthProvider,
  onIdTokenChanged,
  setPersistence,
  signInWithCustomToken,
  signInWithPopup,
  signOut,
  type User,
  type UserCredential,
} from "firebase/auth";
import { isBenignPopupCancel, mapFirebaseError } from "./firebase-errors.ts";

// Firebase tokens live ~1h; used only if a freshly-minted token fails to decode
// (it never should) so the session isn't born already-stale.
const DEFAULT_TOKEN_TTL_MS = 3_600_000;

let authInstance: Auth | null = null;
// Resolves once `setPersistence` settles; sign-in awaits it so the session is
// stored under browserLocalPersistence before the popup opens.
let persistenceReady: Promise<unknown> | null = null;

/** Idempotent singleton init: `initializeApp` + `getAuth` + local persistence. */
export function initWebAuth(config: {
  apiKey: string;
  authDomain: string;
  projectId: string;
}): void {
  if (authInstance) return;
  const app = initializeApp({
    apiKey: config.apiKey,
    authDomain: config.authDomain,
    projectId: config.projectId,
  });
  authInstance = getAuth(app);
  persistenceReady = setPersistence(authInstance, browserLocalPersistence);
}

function requireAuth(): Auth {
  if (!authInstance) {
    // Sign-in before `initWebAuth` is a wiring bug; surface it, don't swallow.
    throw new IdentityError("operation_not_allowed");
  }
  return authInstance;
}

async function ready(): Promise<Auth> {
  const auth = requireAuth();
  if (persistenceReady) await persistenceReady;
  return auth;
}

// Assemble the outcome: the app Session + whether this credential CREATED the
// GCIP account (`getAdditionalUserInfo(...).isNewUser` — the SDK counterpart of
// the REST `isNewUser` field the desktop path reads).
async function toOutcome(cred: UserCredential): Promise<SignInOutcome> {
  return {
    session: await toSession(cred.user),
    isNewUser: getAdditionalUserInfo(cred)?.isNewUser === true,
  };
}

async function popupSignIn(
  provider: GoogleAuthProvider | OAuthProvider,
): Promise<SignInOutcome | null> {
  const auth = await ready();
  try {
    const cred = await signInWithPopup(auth, provider);
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

function toAuthProvider(providerId: string | undefined): AuthProvider {
  switch (providerId) {
    case "google.com":
      return "google.com";
    case "microsoft.com":
      return "microsoft.com";
    case "apple.com":
      return "apple.com";
    case "password":
      return "password";
    default:
      return "custom";
  }
}

/** Build the app's identity `Session` from a Firebase user. */
export async function toSession(user: User): Promise<Session> {
  const idToken = await user.getIdToken();
  const exp = decodeIdTokenClaims(idToken)?.exp;
  const expiresAt =
    typeof exp === "number" ? exp * 1000 : Date.now() + DEFAULT_TOKEN_TTL_MS;
  return {
    idToken,
    refreshToken: user.refreshToken,
    uid: user.uid,
    email: user.email ?? "",
    emailVerified: user.emailVerified,
    displayName: user.displayName,
    photoUrl: user.photoURL,
    provider: toAuthProvider(user.providerData[0]?.providerId),
    expiresAt,
  };
}
