import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import { logAndReportError } from "@houston/app/lib/error-report";
import { IdentityError, type SignInOutcome } from "@houston/app/lib/identity";
import { signInWithCredential } from "firebase/auth";
import { ready } from "../../../web/src/identity/firebase-auth-instance";
import {
  backfillAccountProfile,
  toOutcome,
} from "../../../web/src/identity/firebase-session";
import { nativeIdentity } from "./native-config";
import { type NativeProvider, nativeCredential } from "./native-credential";
import { isNativeSignInCancel, mapNativeSignInError } from "./native-errors";

export {
  initWebAuth,
  toSession,
  webCurrentSession,
  webOnIdTokenChanged,
  webRefreshIdToken,
  webSignInWithCustomToken,
  webSignOut,
} from "../../../web/src/identity/firebase-popup";

async function signIn(provider: NativeProvider): Promise<SignInOutcome | null> {
  if (!nativeIdentity.providers[provider])
    throw new IdentityError("operation_not_allowed");
  try {
    const result =
      provider === "google"
        ? await FirebaseAuthentication.signInWithGoogle()
        : await FirebaseAuthentication.signInWithApple({
            scopes: ["email", "name"],
          });
    const credential = nativeCredential(provider, result);
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
    const mapped = mapNativeSignInError(error);
    if (mapped.code === "unknown") logAndReportError("native_sign_in", error);
    throw mapped;
  }
}

export function webSignInWithGoogle(): Promise<SignInOutcome | null> {
  return signIn("google");
}

export function webSignInWithApple(): Promise<SignInOutcome | null> {
  return signIn("apple");
}

export function webSignInWithMicrosoft(): Promise<SignInOutcome | null> {
  // The plugin cannot expose a Microsoft credential for JS SDK sign-in while
  // skipNativeAuth is true. See Capawesome's firebase-js-sdk.md "Quirks".
  throw new IdentityError("operation_not_allowed");
}
