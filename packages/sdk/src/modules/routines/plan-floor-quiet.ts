import {
  type PlanMinIntervalRefusal,
  parsePlanMinIntervalRefusal,
} from "@houston/protocol/plan-min-interval";

/**
 * The plan-floor refusal behind a failed routine save (`400
 * plan_min_interval`: the schedule fires more often than the saver's plan
 * allows), or null for every other error. Reads the adapter's parsed `body`, a
 * raw text `body`, or the SDK's own error, whose message is the response text.
 * The body is judged by the protocol's one parser, the same the host's
 * refusal is pinned against, so the classifier and the copy that names the
 * floor can never disagree about what counts.
 *
 * Dependency-free beyond that protocol subpath and erasable-syntax-only: the
 * app's node:test entry points load it through the
 * `@houston/sdk/routines/plan-floor-quiet` subpath.
 */
export function planMinIntervalRefusal(
  error: unknown,
): PlanMinIntervalRefusal | null {
  if (!(error instanceof Error)) return null;
  const { status, body } = error as { status?: unknown; body?: unknown };
  if (status !== 400) return null;
  const payload = body === undefined ? error.message : body;
  if (typeof payload !== "string") return parsePlanMinIntervalRefusal(payload);
  try {
    return parsePlanMinIntervalRefusal(JSON.parse(payload));
  } catch {
    return null;
  }
}

/**
 * Whether `error` is that refusal. An EXPECTED state the person can act on,
 * never a bug: every surface's error layer reads it through the quiet
 * classifier and reports nothing (the plan's info copy is the whole surface).
 */
export function isPlanMinIntervalRefusal(error: unknown): boolean {
  return planMinIntervalRefusal(error) !== null;
}
