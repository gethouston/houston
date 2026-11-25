import { isRoutineNotFoundBody } from "@houston/wire-types/routine-refusal";
import { refusalStatus } from "../refusal-code";

/**
 * Whether a failed routine write or run-now was refused because the routine
 * no longer exists (`404 routine_not_found`): deleted elsewhere, or picked
 * from a list a stale mirror served. Reads the adapter's parsed `body`, a raw
 * text `body`, or the SDK's own error, whose message is the response text. A
 * 404 for anything else (`agent not found` above all) never matches.
 *
 * An expected state with its own copy; the surface also refetches the list so
 * the routine disappears. A burst of them still means a stale mirror, which
 * is ours to fix, so every surface reports it as one fingerprinted warning.
 *
 * Dependency-free beyond that wire subpath and erasable-syntax-only: the
 * app's node:test entry points load it through the
 * `@houston/sdk/routines/routine-gone` subpath.
 */
export function isRoutineGone(error: unknown): boolean {
  if (!(error instanceof Error) || refusalStatus(error) !== 404) return false;
  const { body } = error as { body?: unknown };
  const payload = body === undefined ? error.message : body;
  if (typeof payload !== "string") return isRoutineNotFoundBody(payload);
  try {
    return isRoutineNotFoundBody(JSON.parse(payload));
  } catch {
    return false;
  }
}
