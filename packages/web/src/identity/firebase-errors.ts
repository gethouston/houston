// firebase-js-sdk error mapping for the web sign-in surface.
//
// Every `FirebaseError.code` the popup / custom-token flows can raise is mapped
// ONCE, here, onto the app's stable `IdentityError` taxonomy so the shared error
// UI (auth-errors.ts → i18n key → toast) works identically on web and desktop.
// Unrecognized codes fall through to `unknown` rather than leaking a raw SDK
// string, and non-Firebase throws are wrapped too — never swallowed.

import {
  IdentityError,
  type IdentityErrorCode,
} from "@houston/app/lib/identity";
import { FirebaseError } from "firebase/app";

// The user closed the popup, or a second popup superseded this request. These
// are BENIGN cancels, not failures: the caller resolves to a no-op (no session,
// no toast), mirroring a cancelled sign-in. See firebase-popup.ts popupSignIn.
const BENIGN_CANCEL_CODES: ReadonlySet<string> = new Set([
  "auth/popup-closed-by-user",
  "auth/cancelled-popup-request",
]);

const FIREBASE_CODE_MAP: Record<string, IdentityErrorCode> = {
  "auth/operation-not-allowed": "operation_not_allowed",
  "auth/network-request-failed": "network",
  "auth/invalid-custom-token": "invalid_custom_token",
  "auth/too-many-requests": "too_many_attempts",
};

/** Whether `e` is a benign popup cancel that should resolve as a no-op. */
export function isBenignPopupCancel(e: unknown): boolean {
  return e instanceof FirebaseError && BENIGN_CANCEL_CODES.has(e.code);
}

/** Normalize any thrown value into a typed `IdentityError`. */
export function mapFirebaseError(e: unknown): IdentityError {
  if (e instanceof IdentityError) return e;
  if (e instanceof FirebaseError) {
    const code = FIREBASE_CODE_MAP[e.code] ?? "unknown";
    return new IdentityError(code, { rawCode: e.code, cause: e });
  }
  return new IdentityError("unknown", { cause: e });
}
