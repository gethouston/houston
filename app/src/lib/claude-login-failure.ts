/**
 * Pure routing for a failed desktop Claude sign-in — kept dependency-free so
 * node:test can pin the contract without Tauri in the room.
 *
 * The native helper's `claude-login://done` failure payloads come in three
 * shapes, and each wants a different surface:
 *   * `error: null` — the user cancelled; dismiss silently.
 *   * `helperUnavailable: true` — the helper BINARY cannot run on this
 *     machine (pre-AVX2 CPU, signal death; HOUSTON-APP-543). Retrying the
 *     browser login can only reproduce it, so a remote engine degrades to the
 *     runtime's paste flow (which needs no local helper) and a co-located one
 *     gets a translated explanation.
 *   * anything else — a real login failure (declined, timed out, shell gate);
 *     toast the reason verbatim.
 */

/** Payload of the native `claude-login://done` event. */
export interface ClaudeLoginDone {
  success: boolean;
  error: string | null;
  /** The helper binary cannot run on this machine at all. */
  helperUnavailable?: boolean;
}

export type ClaudeLoginFailureRoute =
  /** Benign cancel: clear the pending card, no toast. */
  | { kind: "silent" }
  /** Remote engine + unrunnable helper: start the runtime's paste flow. */
  | { kind: "paste-fallback"; reason: string }
  /** Co-located engine + unrunnable helper: translated explanation. */
  | { kind: "helper-unsupported" }
  /** A real login failure: surface the helper's reason. */
  | { kind: "error"; error: string };

export function classifyClaudeLoginFailure(
  done: ClaudeLoginDone,
  remoteEngine: boolean,
): ClaudeLoginFailureRoute {
  if (done.helperUnavailable) {
    return remoteEngine
      ? { kind: "paste-fallback", reason: done.error ?? "helper unavailable" }
      : { kind: "helper-unsupported" };
  }
  if (done.error === null) return { kind: "silent" };
  return { kind: "error", error: done.error };
}
