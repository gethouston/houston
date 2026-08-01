// The auth-error listener registry — a tiny pub/sub keyed on the stable
// `IdentityErrorCode`. `SignInScreen` subscribes via `onAuthError` so that
// desktop OAuth failures arriving AFTER the browser hands off (provider
// rejection, code-exchange failure, an identity already linked to another user)
// — which have no inline surface of their own — still render. auth.ts emits the
// code; the component resolves it to localized copy. Kept out of auth.ts so that
// file stays a thin sign-in dispatcher.
//
// **Unheard emits are held briefly.** A `signOut()` failure is emitted while the
// sign-in screen is NOT yet mounted — that screen mounts as a RESULT of the
// sign-out, a render later — so a plain broadcast would reach nobody and the
// failure would be silent (the beta policy's cardinal sin). With no listener the
// code is parked and handed to the first subscriber arriving within
// `PENDING_TTL_MS`; anything older is dropped, so a stale failure can never pop
// up on a sign-in screen minutes later.

import type { IdentityErrorCode } from "./identity/errors.ts";
import { identityLog } from "./identity/log.ts";

const LOG_CTX = "lib/auth-error-bus";

type AuthErrorListener = (code: IdentityErrorCode) => void;
const authErrorListeners = new Set<AuthErrorListener>();

/** How long an unheard error waits for the surface that is about to mount. */
const PENDING_TTL_MS = 10_000;

let pending: { code: IdentityErrorCode; at: number } | null = null;

function deliver(cb: AuthErrorListener, code: IdentityErrorCode): void {
  try {
    cb(code);
  } catch (e) {
    identityLog("warn", `error listener threw: ${e}`, LOG_CTX);
  }
}

/** Subscribe to user-initiated auth failures. Returns an unsubscribe fn. */
export function onAuthError(cb: AuthErrorListener): () => void {
  authErrorListeners.add(cb);
  const held = pending;
  pending = null;
  if (held && Date.now() - held.at <= PENDING_TTL_MS) deliver(cb, held.code);
  return () => {
    authErrorListeners.delete(cb);
  };
}

/** Broadcast a failure code to every subscriber (a throwing one is logged). */
export function emitAuthError(code: IdentityErrorCode): void {
  if (authErrorListeners.size === 0) {
    // Nobody is listening yet — hold it for the surface about to mount rather
    // than dropping a user-visible failure on the floor.
    pending = { code, at: Date.now() };
    identityLog(
      "warn",
      `no error surface mounted yet; holding ${code}`,
      LOG_CTX,
    );
    return;
  }
  for (const cb of authErrorListeners) deliver(cb, code);
}

/** Drop any held error (tests + a deliberate reset of the surface). */
export function resetAuthErrorBus(): void {
  pending = null;
}
