// The auth-error listener registry — a tiny pub/sub keyed on the stable
// `IdentityErrorCode`. `SignInScreen` subscribes via `onAuthError` so that
// desktop OAuth failures arriving AFTER the browser hands off (provider
// rejection, code-exchange failure, an identity already linked to another user)
// — which have no inline surface of their own — still render. auth.ts emits the
// code; the component resolves it to localized copy. Kept out of auth.ts so that
// file stays a thin sign-in dispatcher.

import type { IdentityErrorCode } from "./identity";
import { logger } from "./logger";

type AuthErrorListener = (code: IdentityErrorCode) => void;
const authErrorListeners = new Set<AuthErrorListener>();

/** Subscribe to user-initiated auth failures. Returns an unsubscribe fn. */
export function onAuthError(cb: AuthErrorListener): () => void {
  authErrorListeners.add(cb);
  return () => authErrorListeners.delete(cb);
}

/** Broadcast a failure code to every subscriber (a throwing one is logged). */
export function emitAuthError(code: IdentityErrorCode): void {
  for (const cb of authErrorListeners) {
    try {
      cb(code);
    } catch (e) {
      logger.warn(`[auth] error listener threw: ${e}`);
    }
  }
}
