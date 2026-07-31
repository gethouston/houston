/**
 * Device-code fallback for the desktop Codex/OpenAI loopback relay.
 *
 * OpenAI's OAuth client has ONE registered redirect URI on the FIXED local
 * port 1455, so when another process on the user's machine owns that port the
 * one-click relay simply cannot run — Houston can neither pick another port
 * nor free the squatter. Shipped builds still hit this in the wild (Sentry
 * 7639120568: the bind fails with EADDRINUSE even on a fresh first attempt),
 * and the old behavior dead-ended the user: no browser, an error toast, then
 * the 5-minute connect timeout — during onboarding, a wall.
 *
 * The device-code grant needs NO local port: the runtime polls OpenAI while
 * the user types a one-time code, and every login surface (onboarding picker,
 * AI hub, settings, shell fallback) already renders the code dialog when a
 * `ProviderLoginUrl` event carries a `user_code`. So instead of dead-ending,
 * restart the SAME sign-in as a device-code login.
 *
 * Sequencing is load-bearing: the in-flight loopback login must be CANCELLED
 * before the relaunch — the runtime's `startLogin` idempotently reuses an
 * in-flight login, so relaunching without cancelling would hand back the same
 * authorize URL (and the dead loopback) instead of a device code. The cancel
 * also stops the client's connect poll, so no stale timeout toast fires over
 * the fresh dialog.
 *
 * Pure sequencing over injected effects so the policy is unit-testable
 * (node:test can't import the real tauri/store modules).
 */

export interface CodexDeviceCodeFallbackOps {
  /** Log + Sentry-capture the relay failure. NOT a toast: when the fallback
   *  works, the code dialog is the user-facing surface — a "sign-in failed"
   *  toast under a working dialog reads as a contradiction. */
  report(cause: unknown): void;
  /** Cancel the in-flight loopback login (runtime slot + client poll). */
  cancelLogin(): Promise<void>;
  /** Relaunch the sign-in as a device-code grant (`deviceAuth: true`). */
  launchDeviceCodeLogin(): Promise<void>;
  /** Dead-end failure toast — only when the fallback itself failed. */
  fail(cause: unknown): void;
}

/**
 * Run the fallback for a relay that could not start. Never rejects — the
 * caller is an event handler with nobody above it to catch.
 */
export async function runCodexDeviceCodeFallback(
  cause: unknown,
  ops: CodexDeviceCodeFallbackOps,
): Promise<void> {
  ops.report(cause);
  try {
    await ops.cancelLogin();
    await ops.launchDeviceCodeLogin();
  } catch (err) {
    ops.fail(err);
  }
}
