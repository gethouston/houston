/**
 * Lost-login recovery for the desktop Codex/OpenAI loopback relay.
 *
 * The relay's final step hands the OAuth callback code to the engine
 * (`submitLoginCode` → the runtime's `completeLogin`). In managed cloud the
 * login state lives in the runtime process's MEMORY, and the pod serving it
 * can be recycled while the user is on OpenAI's consent screen (Sentry
 * 7625496858 shows the gateway 503 burst of exactly that mid-login). The
 * fresh process answers `no active login for openai-codex`, and the old
 * behavior dead-ended there: a raw `engine request failed (400): {...}` toast
 * the user could only screenshot (HOU-1113).
 *
 * The code itself is unsalvageable — its PKCE verifier died with the old
 * process — but the RECOVERY is cheap: restart the same browser sign-in.
 * OpenAI redirects an already-consented app straight through, so the retried
 * flow usually completes with zero extra clicks. One restart per cooldown
 * window, so an engine that keeps losing state degrades to the failure toast
 * instead of a browser-tab loop.
 *
 * Pure sequencing over injected effects so the policy is unit-testable
 * (node:test can't import the real tauri/store modules).
 */

/**
 * The engine no longer holds the login this relayed code belongs to — the
 * runtime's `completeLogin` threw `no active login for <provider>` (see
 * packages/runtime/src/auth/login.ts). Matched on the message because the
 * host serves it as a bare-string 400 with no typed kind.
 */
export function isLoginSessionLostError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("no active login");
}

/**
 * Longer than one full browser dance (consent + redirect take well under the
 * relay's own 5-minute callback window), so a restarted flow that loses its
 * login AGAIN surfaces the failure instead of opening browser tabs forever.
 */
export const RELAY_RESTART_COOLDOWN_MS = 5 * 60_000;

export interface CodexRelayRecoveryOps {
  /** Log + Sentry-capture the lost-login failure. NOT a toast: when the
   *  restart works the user never needed to know, and when it can't run the
   *  dead-end path below owns the user-facing surface. */
  report(cause: unknown): void;
  /** Restart the SAME browser sign-in (`deviceAuth: false`, no toast). The
   *  fresh `ProviderLoginUrl` event re-enters the loopback relay. */
  restartLogin(): Promise<void>;
  /** Dead-end failure toast — the relay failed and no restart could run. */
  fail(cause: unknown): void;
  /** Last auto-restart for this provider, ms epoch, or null if none yet. */
  lastRestartAt(): number | null;
  /** Record that an auto-restart ran now. */
  noteRestart(): void;
  now(): number;
}

/**
 * Handle a failed relay submit. A lost login within the cooldown budget
 * restarts the sign-in; anything else (a different error, budget spent, the
 * restart itself failing) dead-ends with the failure toast. Never rejects —
 * the caller is an event handler with nobody above it to catch.
 */
export async function recoverFailedCodexRelay(
  cause: unknown,
  ops: CodexRelayRecoveryOps,
): Promise<void> {
  ops.report(cause);
  const last = ops.lastRestartAt();
  const canRestart =
    isLoginSessionLostError(cause) &&
    (last === null || ops.now() - last >= RELAY_RESTART_COOLDOWN_MS);
  if (!canRestart) {
    ops.fail(cause);
    return;
  }
  ops.noteRestart();
  try {
    await ops.restartLogin();
  } catch (err) {
    ops.fail(err);
  }
}
