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
  const { status, body } = err as { status?: unknown; body?: unknown };
  if (status === 404) return true;
  return status === 400 && isOutsideWorkspace(body);
}

/**
 * The host's `invalid workspace path: <path>` 400 on a read: the agent linked
 * a path outside its own workspace, such as the turn sandbox's internal
 * `/work/houston-turn-<id>/store/custom-integrations.json`
 * (HOUSTON-APP-5HK). That file is not in the agent's Files either, so it gets
 * the same copy. The host answers no typed code here, so the fixed message
 * prefix from `packages/host/src/turn/files-path.ts` is what identifies it.
 */
function isOutsideWorkspace(body: unknown): boolean {
  const error = (body as { error?: unknown } | null)?.error;
  return typeof error === "string" && error.startsWith(WORKSPACE_PATH_REFUSAL);
}

const WORKSPACE_PATH_REFUSAL = "invalid workspace path: ";
