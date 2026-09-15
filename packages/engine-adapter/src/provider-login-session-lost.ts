// The "did the runtime lose the login this code belongs to?" classifier for
// the provider-login surfaces. Dependency-free and node-testable; it lives in
// the engine adapter (not app/src/lib) for the same reason as
// engine-waking-error.ts: the adapter is bundled by the desktop app, which
// cannot resolve `@houston/app/*`. app/src/lib/provider-login-session-lost.ts
// re-exports it for the app's call sites.
//
// A relayed OAuth code or a pasted setup token lands on the runtime's
// `completeLogin` (packages/runtime/src/auth/login.ts), which keeps the login
// in process memory. When that memory is gone — the abandoned-login timer
// fired, the pod was recycled mid-consent, the user restarted the app between
// opening the browser and finishing — it throws `no active login for
// <provider>`, which the runtime transport serves as a bare-string 400. That
// is user timing, not a Houston bug: the surfaces show an authored "link
// expired" state (and the desktop relay restarts the sign-in) instead of the
// red bug toast + Sentry pair (HOU-1113 for the mid-onboarding pin, then
// HOUSTON-APP-56B for the remaining "session gone" case).
//
// Keyed on the exact (status, reason prefix) pair on the runtime client's
// `EngineError` shape — the only client both the per-agent runtime and the
// pre-agent setup runtime speak — never on a bare 400: other 400 bodies on the
// same routes (a malformed code, an unknown provider) must keep surfacing as
// real errors.

const NO_ACTIVE_LOGIN = "no active login";

/** The runtime `error` reason out of a raw response body; null when the body
 *  isn't the runtime's `{ error }` JSON. */
function runtimeReason(body: unknown): string | null {
  if (typeof body !== "string" || !body.startsWith("{")) return null;
  try {
    const reason = (JSON.parse(body) as { error?: unknown } | null)?.error;
    return typeof reason === "string" ? reason : null;
  } catch {
    return null;
  }
}

/**
 * True when a login submit failed because the runtime no longer holds the
 * login the code was meant for. Matched structurally (name + status + reason)
 * so this stays dependency-free.
 */
export function isProviderLoginSessionLostError(err: unknown): boolean {
  if (!(err instanceof Error) || err.name !== "EngineError") return false;
  if ((err as { status?: unknown }).status !== 400) return false;
  const reason = runtimeReason((err as { body?: unknown }).body);
  return reason?.startsWith(NO_ACTIVE_LOGIN) ?? false;
}
