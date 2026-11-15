import type { FirstDayRefusal } from "@houston/protocol";
import {
  parseFirstDayRefusal,
  parseFirstDayRefusalText,
} from "@houston/wire-types/first-day-refusal";

/**
 * The typed refusal behind a failed first-day start (`409`, the protocol's
 * `FirstDayRefusalCode`), or null for every other error. Reads the adapter's
 * `HoustonEngineError` (status + parsed `body`, or a raw text `body`) and the
 * SDK's own `AgentsHttpError` (whose message is the response text), so a
 * surface judges the refusal the same way whichever stack threw it.
 *
 * Dependency-free beyond the wire parser's subpath and erasable-syntax-only:
 * the app's node:test entry points load it through the
 * `@houston/sdk/agents/first-day-refusal` subpath.
 */
export function firstDayRefusal(error: unknown): FirstDayRefusal | null {
  if (!error || typeof error !== "object") return null;
  const { status, body, message } = error as {
    status?: unknown;
    body?: unknown;
    message?: unknown;
  };
  if (status !== 409) return null;
  const payload = body === undefined ? message : body;
  return typeof payload === "string"
    ? parseFirstDayRefusalText(payload)
    : parseFirstDayRefusal(payload);
}

/**
 * Whether a start was refused because the person has no AI connected for the
 * first turn (`first_day_no_provider`). An EXPECTED state the person can act
 * on, never a bug: every surface's error layer reads it through the quiet
 * classifier, reports nothing, and offers the connect flow. The first day
 * stays pending, so the same start works once an AI is connected.
 */
export function isFirstDayNoProvider(error: unknown): boolean {
  return firstDayRefusal(error)?.code === "first_day_no_provider";
}

/**
 * Whether a start was refused because the person's AI could not be reached
 * for the first turn right now (`first_day_provider_unavailable`): the
 * provider failed a token refresh, or the lookup timed out. Transient and
 * nothing for us to fix on the client, so every surface reads it through the
 * quiet classifier (one fingerprinted warning, copy asking to try again). The
 * first day stays pending, so the same start works once the provider answers.
 */
export function isFirstDayProviderUnavailable(error: unknown): boolean {
  return firstDayRefusal(error)?.code === "first_day_provider_unavailable";
}

/**
 * Whether a start was refused because the employee has no first day waiting
 * (`first_day_not_pending`): another tab or the AI Manager already started
 * it, or the employee has none. The surface's start button was stale; the
 * config refetch takes it away. Not a failure to report.
 */
export function isFirstDayNotPending(error: unknown): boolean {
  return firstDayRefusal(error)?.code === "first_day_not_pending";
}
