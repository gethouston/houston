// The two "quiet" failure classes of the error-surfacing layer, and the
// context a low-noise Sentry event for one of them carries. Dependency-free
// (only the two classifiers) so it is node-testable directly
// (app/tests/quiet-error-class.test.ts).
//
// A quiet class is an expected environment state — the agent's pod waking
// (`isEngineWakingError`) or the device offline (`isNetworkTransportError`) —
// that the user sees as ONE informational toast, never the bug pair. Until
// PRODUCT-1640 the same classes were declined by every Sentry path outright,
// so a raw gateway body (a DNS dial error against a cold pod, say) existed
// only in the user's local frontend log: hidden from the user had become
// hidden from us. They now capture as a warning with a FIXED fingerprint per
// class (`quiet-error-report.ts`), so each class is one Sentry issue with a
// count and searchable bodies, and a deploy roll can never file new issues.

import { isEngineWakingError } from "./engine-waking-error.ts";
import { isNetworkTransportError } from "./network-transport-error.ts";

/** Doubles as the Sentry fingerprint, so the value is the issue's identity. */
export type QuietErrorClass = "engine_waking" | "offline";

export function classifyQuietError(err: unknown): QuietErrorClass | null {
  if (isEngineWakingError(err)) return "engine_waking";
  if (isNetworkTransportError(err)) return "offline";
  return null;
}

export interface QuietErrorDetails {
  /** HTTP status of the gateway answer; null for a transport drop. */
  status: number | null;
  /** The raw response body, whatever shape the client stack kept it in. */
  body: string | null;
}

/**
 * The status and RAW body off any of the three gateway error shapes
 * (`HoustonEngineError` keeps the parsed JSON on `body`, `AgentsHttpError`
 * carries the raw text as its message, the runtime client's `EngineError`
 * keeps the raw text on `body`) — the searchable payload the Sentry event
 * exists to carry. A transport `TypeError` has no status and its message IS
 * the diagnostic.
 */
export function quietErrorDetails(err: unknown): QuietErrorDetails {
  if (!(err instanceof Error)) return { status: null, body: null };
  const status = (err as { status?: unknown }).status;
  const body = (err as { body?: unknown }).body;
  const rawBody =
    typeof body === "string"
      ? body
      : body !== null && body !== undefined
        ? JSON.stringify(body)
        : err.message;
  return { status: typeof status === "number" ? status : null, body: rawBody };
}

/**
 * The agent a failed call was scoped to, when anything on the way knows it:
 * the `agentId` the gateway fetch stamps on a per-agent `HoustonEngineError`
 * first — it is the SAME id the fetch reports successes under, so an episode
 * keyed on it is the one a later success closes — else the engine-call
 * `context` (some `call()` sites pass `agentPath` / `agentId`). Null for
 * calls no layer could scope (the SDK agent-write path, the runtime client):
 * those still capture, they just cannot feed the per-agent stuck-wake tracker.
 */
export function agentKeyOf(
  err: unknown,
  context?: Record<string, unknown>,
): string | null {
  const stamped = (err as { agentId?: unknown } | null)?.agentId;
  if (typeof stamped === "string" && stamped) return stamped;
  for (const key of ["agentId", "agentPath"]) {
    const value = context?.[key];
    if (typeof value === "string" && value) return value;
  }
  return null;
}
