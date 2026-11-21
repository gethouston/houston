import {
  isSessionStatusOrigin,
  isTurnErrorClass,
  type SessionStatusOrigin,
  type TurnErrorClass,
  turnErrorDisposition,
} from "@houston/sdk/turns/turn-error-class";
import { classifyAnalyticsError } from "./analytics-error-kind.ts";
import { type BurstGate, createBurstGate } from "./error-burst.ts";

export interface SessionErrorData {
  agent_path: string;
  session_key: string;
  error: string | null;
  error_class?: string;
  origin?: string;
}

export interface SessionFailureEvent {
  event: "session_failed" | "app_error_shown";
  props: {
    source?: "session";
    error_kind?: string;
    error_class?: TurnErrorClass;
    origin?: SessionStatusOrigin;
  };
}

function legacyErrorKind(
  error: string | null,
  cls: TurnErrorClass | undefined,
): string | undefined {
  if (error) return classifyAnalyticsError(error);
  if (cls === "provider_unauthenticated") return "auth";
  if (cls?.startsWith("provider_")) return "provider";
  return undefined;
}

export const SESSION_ERROR_SHOWN_WINDOW_MS = 60 * 60 * 1_000;

export function createSessionFailureTracker(
  gate: BurstGate = createBurstGate(SESSION_ERROR_SHOWN_WINDOW_MS),
): (data: SessionErrorData, now: number) => SessionFailureEvent[] {
  return (data, now) => {
    const cls = isTurnErrorClass(data.error_class)
      ? data.error_class
      : undefined;
    if (!cls && !data.error) return [];
    const disposition = cls ? turnErrorDisposition(cls) : "failure";
    if (disposition === "intended") return [];
    const errorKind = legacyErrorKind(data.error, cls);
    const props: SessionFailureEvent["props"] = {
      ...(errorKind ? { error_kind: errorKind } : {}),
      ...(cls ? { error_class: cls } : {}),
      ...(isSessionStatusOrigin(data.origin) ? { origin: data.origin } : {}),
    };
    const events: SessionFailureEvent[] = [{ event: "session_failed", props }];
    if (disposition !== "failure") return events;
    const key = `${data.agent_path}\n${data.session_key}\n${cls ?? errorKind}`;
    if (gate.isFirst(key, now))
      events.push({
        event: "app_error_shown",
        props: { source: "session", ...props },
      });
    return events;
  };
}

export const sessionFailureEvents = createSessionFailureTracker();
