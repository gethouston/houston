/**
 * A workspace-file read answered "file not found" (HOUSTON-APP-53E /
 * PRODUCT-1780).
 *
 * `files/download` and `files/read` have exactly one 404 path of their own:
 * the host's `file not found`, answered when the path resolves inside the
 * agent's workspace but no object is there. The user reaches it in expected
 * ways, none of which is a Houston bug: the agent linked a file it never
 * wrote (or wrote under another name), the file was renamed or deleted after
 * the link was rendered, or the click landed in the gap of a rewrite. The
 * honest surface is "that file isn't there anymore", not a red bug toast, so
 * the read is silenced (`call()` still logs it; no Sentry report) and the
 * surface shows authored copy instead. The host logs WHY on its side.
 *
 * Like `isAgentGoneError`, the classifier keys on the structural `.status`:
 * the host emits a bare-string error body with no typed `kind`, and both
 * engine adapters (`HoustonEngineError`) carry the status. An agent-gone 404
 * on the same route (stale roster) is equally the user's state and shares the
 * copy. Applied ONLY to the two reads; writes keep the default loud surfacing.
 */
export function isFileGoneError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  return (err as { status?: unknown }).status === 404;
}
