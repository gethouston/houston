import {
  IdentityError,
  type IdentityErrorCode,
} from "@houston/app/lib/identity";
import { FirebaseError } from "firebase/app";

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

export function isBenignPopupCancel(e: unknown): boolean {
  return e instanceof FirebaseError && BENIGN_CANCEL_CODES.has(e.code);
}

export function mapFirebaseError(e: unknown): IdentityError {
  if (e instanceof IdentityError) return e;
  if (e instanceof FirebaseError) {
    const code = FIREBASE_CODE_MAP[e.code] ?? "unknown";
    return new IdentityError(code, { rawCode: e.code, cause: e });
  }
  return new IdentityError("unknown", { cause: e });
}
