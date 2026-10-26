// Type-only import, erased at runtime: the app's node:test runner loads this
// module through the `@houston/sdk/turns/turn-error-class` subpath and
// resolves no extensionless relative import. Keep it dependency-free.
import type { ProviderError } from "@houston/runtime-client";

/**
 * WHY a turn ended in an `error` session status, read from the typed input of
 * the settle that produced it (the notice kind, the SDK's own message
 * constants, the typed provider card), never from the chat copy. The copy is
 * product voice that deliberately hides the cause (HOU-705): once a surface
 * sees "Something went wrong. Please try again." a transport drop, a host
 * failure and a thrown bug are one and the same. Rides additively on
 * {@link SessionStatusDetail} so a surface can count failures by cause.
 *
 * - `stopped`: the person pressed Stop.
 * - `engine_restart`: the engine died mid-turn and parked the turn for a
 *   "continue" (the `engine_restart` notice).
 * - `send_busy` / `compute_busy`: a send that ran out of hold budget behind a
 *   running turn / with no room on the shared compute.
 * - `turn_died`: the terminal frame was lost and history holds no reply.
 * - `send_lost`: the send failed at the transport level and nothing proved
 *   the turn started.
 * - `stream_lost`: the resumable stream exhausted its reconnect budget.
 * - `agent_too_large` / `agent_setup_failed`: a pooled turn that failed before
 *   any provider work (H-003, the `TurnSetupFailure` codes): the agent holds
 *   more than a worker can open / any other setup code. Two classes, not one
 *   `setup_failed`: the first is unretryable and sized by the agent's data,
 *   the second is a transient worker fault, so they are fixed, and counted,
 *   apart. Both are `failure`: the line is authored, but the cause is ours
 *   (the SDK already reports each one, `turnFailureReport`), so a surface
 *   counts them as errors shown, never as handled states.
 * - `turn_unconfirmed`: an accepted turn whose conversation never appeared
 *   and whose end never reached us (the pre-settled poll's bound). Its own
 *   class rather than `unexplained`: nothing failed that we know of, so a
 *   dashboard must tell "lost after the 202" from "threw". Also `failure`
 *   (reported as `turn_gone_after_accept`).
 * - `unexplained`: the turn failed with no engine verdict (a transport drop,
 *   a thrown bug); the raw cause is in the frontend log.
 * - `engine_verdict`: the engine's own error copy (a wire `error` frame, a
 *   refused send) matching no typed state.
 * - `provider_<kind>`: a typed provider card (`ProviderError.kind`), the
 *   client-built not-connected card (`provider_unauthenticated`) and a plan
 *   refusal (`provider_plan_message_limit`) included.
 */
export type TurnErrorClass =
  | (typeof TURN_ERROR_CLASSES)[number]
  | `provider_${ProviderError["kind"]}`;

const TURN_ERROR_CLASSES = [
  "stopped",
  "engine_restart",
  "send_busy",
  "compute_busy",
  "turn_died",
  "send_lost",
  "stream_lost",
  "agent_too_large",
  "agent_setup_failed",
  "turn_unconfirmed",
  "unexplained",
  "engine_verdict",
] as const;

/** Every `ProviderError.kind`; a kind added to the union fails to compile here. */
const PROVIDER_ERROR_KINDS: Record<ProviderError["kind"], true> = {
  plan_message_limit: true,
  unauthenticated: true,
  rate_limited: true,
  quota_exhausted: true,
  model_unavailable: true,
  context_overflow: true,
  provider_internal: true,
  malformed_response: true,
  network_unreachable: true,
  usage_limit_paused: true,
  unknown: true,
};

const PROVIDER_PREFIX = "provider_";

export function providerErrorClass(
  kind: ProviderError["kind"],
): TurnErrorClass {
  return `${PROVIDER_PREFIX}${kind}`;
}

/** Whether an untyped value (a bus event field) names a class. */
export function isTurnErrorClass(value: unknown): value is TurnErrorClass {
  if (typeof value !== "string") return false;
  if ((TURN_ERROR_CLASSES as readonly string[]).includes(value)) return true;
  return (
    value.startsWith(PROVIDER_PREFIX) &&
    Object.hasOwn(PROVIDER_ERROR_KINDS, value.slice(PROVIDER_PREFIX.length))
  );
}

/**
 * How a surface accounts for an `error` status of this class.
 *
 * - `intended`: the person asked for it (Stop); not a failure at all.
 * - `handled`: the turn failed, but in a state the product explains with its
 *   own copy or card and a next step (a restart line, a busy notice, a typed
 *   provider card). A failed turn to count, never an error to report as a bug.
 * - `failure`: nothing explained it to the person beyond generic copy; this
 *   is what "an error was shown" means.
 */
export type TurnErrorDisposition = "intended" | "handled" | "failure";

export function turnErrorDisposition(
  cls: TurnErrorClass,
): TurnErrorDisposition {
  if (cls === "stopped") return "intended";
  // `provider_unknown` is the card for a provider failure the runtime could
  // not classify: its copy is generic and its only detail is a raw excerpt,
  // so the person saw an unexplained error. `provider_internal` (the
  // provider's own outage, with its status) and `malformed_response` (a cut
  // repetition loop, retry) each name what happened and the next step, so
  // they stay handled like every other typed card.
  if (cls === "provider_unknown") return "failure";
  if (
    cls === "engine_restart" ||
    cls === "send_busy" ||
    cls === "compute_busy" ||
    cls.startsWith(PROVIDER_PREFIX)
  )
    return "handled";
  return "failure";
}

/**
 * Whose turn a session status belongs to: one THIS client sent (`sent`), or
 * one it merely observes, left running by another device, a member or a
 * scheduled run (`observed`). One looping background run on one device would
 * otherwise read as the whole fleet failing.
 */
export type SessionStatusOrigin = "sent" | "observed";

export function isSessionStatusOrigin(
  value: unknown,
): value is SessionStatusOrigin {
  return value === "sent" || value === "observed";
}

/**
 * What rides beside a session status (additive; every field optional so an
 * output written before it keeps working). `origin` is stamped on every
 * settle; `errorClass` only on an `error` status.
 */
export interface SessionStatusDetail {
  errorClass?: TurnErrorClass;
  origin?: SessionStatusOrigin;
  /** Expected end at the reply ceiling, separate from an ordinary completed reply. */
  stopReason?: "turn_time_limit" | "turn_time_limit_unsaved";
}
