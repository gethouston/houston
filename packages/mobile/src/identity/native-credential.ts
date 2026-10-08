import type { SignInResult } from "@capacitor-firebase/authentication";
import { IdentityError } from "@houston/app/lib/identity";
import {
  GoogleAuthProvider,
  type OAuthCredential,
  OAuthProvider,
} from "firebase/auth";

export type NativeProvider = "google" | "apple";

function requireField(value: string | undefined, field: string): string {
  if (value) return value;
  throw new IdentityError("unknown", {
    cause: new Error(`Native sign-in omitted ${field}`),
  });
}

export function nativeCredential(
  provider: NativeProvider,
  result: SignInResult,
): OAuthCredential {
  if (provider === "google")
    return GoogleAuthProvider.credential(
      requireField(result.credential?.idToken, "Google ID token"),
    );

  // Apple requires skipNativeAuth and the original (unhashed) nonce that
  // Capawesome returns: https://github.com/capawesome-team/capacitor-firebase/blob/main/packages/authentication/docs/firebase-js-sdk.md#usage
  return new OAuthProvider("apple.com").credential({
    idToken: requireField(result.credential?.idToken, "Apple ID token"),
    rawNonce: requireField(result.credential?.nonce, "Apple nonce"),
  });
}
