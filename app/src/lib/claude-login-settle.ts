/**
 * Settlement policy for the desktop → cloud Claude credential handoff: after
 * the push has run (and the local handoff copy is discarded), decide what the
 * login OUTCOME is. Dependency-free so it is node-testable directly
 * (`app/tests/claude-login-settle.test.ts`), like the sibling
 * `claude-credential-push`.
 *
 * The load-bearing rule (HOU-1143): a failed push TRANSPORT does not prove
 * the credential didn't land. The gateway may hold a first-touch push through
 * a setup-pod cold start longer than the webview's fetch timeout, the host
 * answers 502 when the credential stored centrally but the pod materialize
 * failed (the per-turn serve path self-heals both), and a network drop can
 * eat a response to a push that succeeded. Every one of those used to dump
 * the token paste dialog on a user whose connect actually WORKED — so when a
 * credential left this machine, believe the engine's own usability probe over
 * the transport error, and only fail when anthropic really reads
 * disconnected.
 *
 * A failed EXTRACTION (`no-credential`) is different: nothing left the
 * machine, so there is nothing to probe for — fail immediately.
 *
 * What a genuine failure surfaces CHANGED after the 2026-08-15 incident: a
 * broken engine image (its `claude` binary missing, `spawn claude ENOENT`)
 * made every settle read disconnected, and the old `paste` settlement dressed
 * that infrastructure failure up as a user task ("run `claude setup-token`").
 * The user did everything right — their browser login SUCCEEDED — so a failed
 * handoff is Houston's failure and settles as `handoff-failed`: a standard
 * error surface (toast + Sentry report), never the paste dialog. The paste
 * flow remains reachable only where the LOCAL machine can't run the browser
 * login at all (pre-AVX2 helper SIGILL — see claude-login-failure.ts).
 */

/** Outcome of `pushMintedClaudeCredential` (extraction + push, never throws). */
export type ClaudeHandoffResult =
  | { ok: true }
  | { ok: false; reason: "no-credential" | "push-failed"; error: unknown };

export type ClaudeLoginSettlement =
  /** Anthropic reads connected. `recovered` marks the HOU-1143 shape — the
   *  push transport failed but the credential landed anyway — so the caller
   *  can report the transport failure to Sentry without failing the user. */
  | { kind: "connected"; recovered: boolean }
  /** Push succeeded but the engine never read the credential connected inside
   *  the confirm window — surface the timeout, NOT the paste dialog (the
   *  credential is stored; the pod is just slow). */
  | { kind: "confirm-timeout" }
  /** The handoff genuinely failed (extraction, or push + disconnected probe).
   *  An infrastructure failure on Houston's side: surface a standard error
   *  with the report-bug affordance, never the paste dialog. */
  | { kind: "handoff-failed"; reason: unknown };

/**
 * Decide the login outcome from the push result plus the engine's own view.
 * `confirm` is the bounded usability poll (claude-login's `confirmConnected`):
 * it resolves true only when the runtime can actually serve anthropic, so a
 * stale broken credential cannot fake a recovery.
 */
export async function settleRemoteClaudeLogin(
  result: ClaudeHandoffResult,
  confirm: () => Promise<boolean>,
): Promise<ClaudeLoginSettlement> {
  if (result.ok) {
    return (await confirm())
      ? { kind: "connected", recovered: false }
      : { kind: "confirm-timeout" };
  }
  if (result.reason === "push-failed" && (await confirm())) {
    return { kind: "connected", recovered: true };
  }
  return { kind: "handoff-failed", reason: result.error };
}
