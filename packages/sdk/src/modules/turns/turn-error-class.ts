import type { ProviderError } from "@houston/runtime-client";

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

export function isTurnErrorClass(value: unknown): value is TurnErrorClass {
  if (typeof value !== "string") return false;
  if ((TURN_ERROR_CLASSES as readonly string[]).includes(value)) return true;
  return (
    value.startsWith(PROVIDER_PREFIX) &&
    Object.hasOwn(PROVIDER_ERROR_KINDS, value.slice(PROVIDER_PREFIX.length))
  );
}

export type TurnErrorDisposition = "intended" | "handled" | "failure";

export function turnErrorDisposition(
  cls: TurnErrorClass,
): TurnErrorDisposition {
  if (cls === "stopped") return "intended";
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

export type SessionStatusOrigin = "sent" | "observed";

export function isSessionStatusOrigin(
  value: unknown,
): value is SessionStatusOrigin {
  return value === "sent" || value === "observed";
}

export interface SessionStatusDetail {
  errorClass?: TurnErrorClass;
  origin?: SessionStatusOrigin;
  stopReason?: "turn_time_limit" | "turn_time_limit_unsaved";
}
