import { IdentityError } from "@houston/app/lib/identity";
import { FirebaseError } from "firebase/app";
import {
  isBenignPopupCancel,
  mapFirebaseError,
} from "../../../web/src/identity/firebase-errors";

function errorFields(error: unknown): { code?: string; message?: string } {
  if (typeof error !== "object" || error === null) return {};
  const value = error as Record<string, unknown>;
  return {
    code: typeof value.code === "string" ? value.code : undefined,
    message: typeof value.message === "string" ? value.message : undefined,
  };
}

export function isNativeSignInCancel(error: unknown): boolean {
  if (isBenignPopupCancel(error)) return true;
  const { code, message } = errorFields(error);
  return (
    code === "auth/popup-closed-by-user" ||
    code === "auth/cancelled-popup-request" ||
    message === "Authorization canceled." ||
    message === "Sign in canceled." ||
    message === "The user canceled the sign-in flow." ||
    message?.includes(
      "com.apple.AuthenticationServices.AuthorizationError error 1001",
    ) === true
  );
}

export function mapNativeSignInError(error: unknown): IdentityError {
  if (error instanceof FirebaseError || error instanceof IdentityError)
    return mapFirebaseError(error);
  const { code } = errorFields(error);
  if (code?.startsWith("auth/"))
    return mapFirebaseError(new FirebaseError(code, String(error)));
  return new IdentityError("unknown", { rawCode: code, cause: error });
}
