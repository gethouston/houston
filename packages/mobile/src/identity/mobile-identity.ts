import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import { logAndReportError } from "@houston/app/lib/error-report";
import {
  IdentityError,
  type PendingLink,
  type SignInOutcome,
} from "@houston/app/lib/identity";
import { type OAuthCredential, signInWithCredential } from "firebase/auth";
import { ready } from "../../../web/src/identity/firebase-auth-instance";
import {
  holdAccountExists,
  isAccountExists,
} from "../../../web/src/identity/firebase-link";
import { webSignOut as jsSignOut } from "../../../web/src/identity/firebase-popup";
import {
  backfillAccountProfile,
  toOutcome,
} from "../../../web/src/identity/firebase-session";
import { nativeIdentity } from "./native-config";
import { type NativeProvider, nativeCredential } from "./native-credential";
import { isNativeSignInCancel, mapNativeSignInError } from "./native-errors";

export {
  webDiscardPending,
  webLinkPending,
} from "../../../web/src/identity/firebase-link";
export {
  initWebAuth,
  toSession,
  webCurrentSession,
  webOnIdTokenChanged,
  webRefreshIdToken,
  webSignInWithCustomToken,
} from "../../../web/src/identity/firebase-popup";

/** A hung native plugin must never hold the sign-out screen hostage. */
export const NATIVE_SIGN_OUT_TIMEOUT_MS = 3_000;

async function nativeSignOut(): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      FirebaseAuthentication.signOut(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Native sign-out timed out after 3 seconds")),
          NATIVE_SIGN_OUT_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Sign out of the JS session AND the native one. The native Google SDK /
 * Credential Manager and Apple's native Firebase session outlive the JS
 * signOut, so skipping them hands the next sign-in the previous account. A
 * native failure is reported but never fails the sign-out: the JS session is
 * the one Houston restores on launch.
 */
export async function webSignOut(): Promise<void> {
  try {
    await jsSignOut();
  } finally {
    try {
      await nativeSignOut();
    } catch (error) {
      logAndReportError("native_sign_out", error);
    }
  }
}

async function signIn(
  provider: NativeProvider,
): Promise<SignInOutcome | PendingLink | null> {
  if (!nativeIdentity.providers[provider])
    throw new IdentityError("operation_not_allowed");
  // Kept outside the try: an existing account refuses it, and the link needs it.
  let credential: OAuthCredential | null = null;
  try {
    const result =
      provider === "google"
        ? await FirebaseAuthentication.signInWithGoogle()
        : await FirebaseAuthentication.signInWithApple({
            scopes: ["email", "name"],
          });
    credential = nativeCredential(provider, result);
    const userCredential = await signInWithCredential(
      await ready(),
      credential,
    );
    // Apple's native sheet returns the name only on first consent; the JS
    // credential carries only token and nonce, so preserve that first result.
    await backfillAccountProfile(userCredential.user, result.user?.displayName);
    return await toOutcome(userCredential);
  } catch (error) {
    if (isNativeSignInCancel(error)) return null;
    if (isAccountExists(error))
      return holdAccountExists(
        error,
        provider === "google" ? "google.com" : "apple.com",
        credential,
      );
    const mapped = mapNativeSignInError(error);
    if (mapped.code === "unknown") logAndReportError("native_sign_in", error);
    throw mapped;
  }
}

export function webSignInWithGoogle(): Promise<
  SignInOutcome | PendingLink | null
> {
  return signIn("google");
}

export function webSignInWithApple(): Promise<
  SignInOutcome | PendingLink | null
> {
  return signIn("apple");
}

export function webSignInWithMicrosoft(): Promise<
  SignInOutcome | PendingLink | null
> {
  // The plugin cannot expose a Microsoft credential for JS SDK sign-in while
  // skipNativeAuth is true. See Capawesome's firebase-js-sdk.md "Quirks".
  throw new IdentityError("operation_not_allowed");
}
