/**
 * Supabase auth-js coordinates token refresh across browser contexts (tabs,
 * webviews, Houston's multi-window shell) with the Web Locks API. When one
 * context's lock acquire times out, auth-js recovers by *stealing* the lock
 * (`navigator.locks.request(name, { steal: true }, …)`). Per the Web Locks
 * spec the displaced holder's request promise then rejects. Depending on the
 * browser build and the bundled auth-js version that surfaces as either:
 *
 *   - a raw DOMException — "Lock was stolen by another request" or
 *     "Lock broken by another request with the 'steal' option", or
 *   - auth-js's typed `NavigatorLockAcquireTimeoutError`, which carries
 *     `isAcquireTimeout === true` (the `ProcessLock` variant sets it too).
 *
 * None of these are real failures: the steal *is* the recovery and the auto
 * refresh simply retries on its next tick. Supabase fires that refresh from an
 * internal timer we can't attach a `.catch` to, so when it rejects it reaches
 * our global `onunhandledrejection` handler. Without this guard it became a
 * scary "we have a problem" toast for non-technical users plus unactionable
 * Sentry noise (HOU-435 / HOUSTON-APP-8Y, dup APP-6Q).
 *
 * Treat it as background lock contention: swallow it, don't surface it. This is
 * NOT a banned silent-failure — the rejection comes from a background timer, is
 * not a user-initiated action, and is recovered automatically. User-initiated
 * auth calls (sign-in, code exchange) are awaited with their own try/catch in
 * `auth.ts`, so those rejections are *handled* and never reach this predicate.
 */
export function isBenignLockRejection(reason: unknown): boolean {
  if (!reason || typeof reason !== "object") return false;

  // auth-js's typed acquire-timeout / steal errors flag themselves. Filtering
  // on this is exactly auth-js's documented intent ("convert to a typed error
  // so callers can handle/filter it without it leaking to Sentry as a raw
  // AbortError").
  if ((reason as { isAcquireTimeout?: unknown }).isAcquireTimeout === true) {
    return true;
  }

  const message = (reason as { message?: unknown }).message;
  if (typeof message !== "string") return false;
  const normalized = message.toLowerCase();
  // Raw Web Locks DOMException phrasings (they vary by browser build) plus
  // auth-js's own wrapped message. All describe the same steal event.
  return (
    normalized.includes("stolen by another request") ||
    normalized.includes("broken by another request") ||
    normalized.includes("another request stole it")
  );
}
