// Retry policy for the desktop→cloud Claude credential push, dependency-free
// so it is node-testable directly (app/tests/claude-push-retry.test.ts) —
// the surrounding claude-login-remote module drags the Tauri import chain.

/** Backoff between push attempts. ~17s worst case keeps the user inside the
 *  flow's existing wait affordance rather than dumping them to the paste
 *  dialog on the first blip. */
export const PUSH_RETRY_DELAYS_MS = [2_000, 5_000, 10_000];

/**
 * A push failure worth retrying: an engine/gateway 5xx (pod waking, setup pod
 * re-provisioning, brief gateway unavailability) or a plain network drop (no
 * `status` at all). A 4xx is terminal — a malformed envelope or a refused
 * push never heals by retrying.
 */
export function isTransientPushError(err: unknown): boolean {
  const status = (err as { status?: unknown } | null)?.status;
  if (typeof status === "number") return status >= 500;
  return err instanceof TypeError; // fetch's network-failure shape
}
