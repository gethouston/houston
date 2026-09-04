/**
 * Lost-login recovery for the desktop Codex/OpenAI loopback relay.
 *
 * The relay's final step hands the OAuth callback code to the engine
 * (`submitLoginCode` → the runtime's `completeLogin`). The login state lives
 * in the runtime process's MEMORY, and it is gone by the time the code
 * arrives whenever the user's timing outran it: the pod serving it was
 * recycled while the user sat on OpenAI's consent screen (Sentry 7625496858
 * shows the gateway 503 burst of exactly that mid-login, HOU-1113), the
 * abandoned-login timer fired, or the app was restarted between opening the
 * browser and approving. The fresh process answers `no active login for
 * openai-codex`, and the old behavior dead-ended there: a raw `engine request
 * failed (400): {...}` toast the user could only screenshot.
 *
 * The code itself is unsalvageable — its PKCE verifier died with the old
 * process — but the RECOVERY is cheap: restart the same browser sign-in.
 * OpenAI redirects an already-consented app straight through, so the retried
 * flow usually completes with zero extra clicks. One restart per cooldown
 * window, so an engine that keeps losing state degrades to the "start the
 * sign-in again" state instead of a browser-tab loop.
 *
 * A lost login is user timing, not a Houston bug (HOUSTON-APP-56B): it never
 * mints a Sentry error — a breadcrumb keeps the diagnostic findable — and the
 * user sees an authored expected-state toast, never the red bug pair. Every
 * OTHER relay failure keeps the loud path (report + failure toast).
 *
 * Pure sequencing over injected effects so the policy is unit-testable
 * (node:test can't import the real tauri/store modules).
 */

import { isProviderLoginSessionLostError } from "./provider-login-session-lost.ts";

/**
 * Longer than one full browser dance (consent + redirect take well under the
 * relay's own 5-minute callback window), so a restarted flow that loses its
 * login AGAIN surfaces the expired state instead of opening browser tabs
 * forever.
 */
export const RELAY_RESTART_COOLDOWN_MS = 5 * 60_000;

export interface CodexRelayRecoveryOps {
  /** Log + Sentry-capture a relay failure that is NOT a lost login. NOT a
   *  toast: the dead-end path below owns the user-facing surface. */
  report(cause: unknown): void;
  /** Breadcrumb for a lost login: reaches the frontend log and Sentry's
   *  breadcrumb trail, never an error event of its own. */
  breadcrumb(cause: unknown): void;
  /** Restart the SAME browser sign-in (`deviceAuth: false`, no toast). The
   *  fresh `ProviderLoginUrl` event re-enters the loopback relay. */
  restartLogin(): Promise<void>;
  /** Dead-end failure toast — the relay failed for a reason that is not a
   *  lost login, or the restart itself could not run. */
  fail(cause: unknown): void;
  /** Expected-state toast for a lost login: "that sign-in link expired",
   *  worded for an automatic restart or for the user to start over. */
  expired(restarting: boolean): void;
  /** Last auto-restart for this provider, ms epoch, or null if none yet. */
  lastRestartAt(): number | null;
  /** Record that an auto-restart ran now. */
  noteRestart(): void;
  now(): number;
}

/**
 * Handle a failed relay submit. A lost login is an expected state: within the
 * cooldown budget it restarts the sign-in (telling the user why a browser tab
 * is opening again), past it the user is asked to start over. Anything else
 * (a different error, the restart itself failing) reports and dead-ends with
 * the failure toast. Never rejects — the caller is an event handler with
 * nobody above it to catch.
 */
export async function recoverFailedCodexRelay(
  cause: unknown,
  ops: CodexRelayRecoveryOps,
): Promise<void> {
  if (!isProviderLoginSessionLostError(cause)) {
    ops.report(cause);
    ops.fail(cause);
    return;
  }
  ops.breadcrumb(cause);
  const last = ops.lastRestartAt();
  const canRestart =
    last === null || ops.now() - last >= RELAY_RESTART_COOLDOWN_MS;
  if (!canRestart) {
    ops.expired(false);
    return;
  }
  ops.noteRestart();
  ops.expired(true);
  try {
    await ops.restartLogin();
  } catch (err) {
    ops.fail(err);
  }
}
