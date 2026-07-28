// The ONE "is this failure worth another attempt?" classifier for engine and
// gateway calls. Dependency-free so it is node-testable directly
// (app/tests/transient-error.test.ts) and importable from anywhere.
//
// The rule, everywhere: a 5xx (pod waking, gateway rolling, brief
// unavailability) or a transport-level drop heals on its own; a 4xx does not.
// Retrying a 401/403/404 only delays the toast that tells the user what to do.

/**
 * A failure a bounded retry can plausibly recover from: an engine/gateway 5xx,
 * or a plain network drop (`fetch` rejects with a `TypeError` and no status).
 * Everything else — 4xx, parse errors, programming errors — is terminal.
 */
export function isTransientEngineError(err: unknown): boolean {
  const status = (err as { status?: unknown } | null)?.status;
  if (typeof status === "number") return status >= 500;
  return err instanceof TypeError; // fetch's network-failure shape
}
