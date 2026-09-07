// The "does this deployment serve a personal assistant at all?" classifier.
// Dependency-free so it is node-testable directly
// (app/tests/assistant-availability.test.ts) and importable from anywhere.
//
// Sibling of `shared-skills-availability.ts` and `agent-gone.ts`: a small,
// typed predicate over an engine error shape, used to decide how a failure is
// SURFACED — never to decide whether it is reported.

/** The host's code for "the gateway serves assistant discovery, not this
 *  engine" (501, `packages/host/src/routes/assistant.ts`). */
export const ASSISTANT_GATEWAY_ONLY = "assistant_gateway_only";
/** The host's code for "this host holds no agent tree, so it cannot hold an
 *  assistant" (503, same route). */
export const ASSISTANT_UNAVAILABLE = "assistant_unavailable";

/**
 * True when `GET /v1/assistant` answered that this deployment has no personal
 * assistant to open.
 *
 * This is feature ABSENCE, not failure: nothing broke, nothing is retryable,
 * and there is no bug to report. The sidebar entry and the screen simply do not
 * exist, exactly as the AI Models hub does not exist for a plain member. Every
 * OTHER discovery failure — a real 5xx, an auth rejection, a malformed answer —
 * keeps the loud path, so the no-silent-failures policy holds.
 *
 * Keyed on the STATUS the `HoustonEngineError` carries, never on the rendered
 * message: the two adapters wrap the body differently (the engine-client nests
 * it under `error`, the web adapter passes the host's flat object through), and
 * only the status is identical across both. 501 and 503 are the route's ONLY
 * two "no assistant here" answers, and neither is used for anything else on it.
 */
export function isAssistantUnavailableError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const status = (err as { status?: unknown }).status;
  return status === 501 || status === 503;
}
