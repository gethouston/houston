import type { FirstResponse, FirstResponseOutcome } from "@houston/sdk";
import type { PerfSpanName } from "./perf-spans.ts";

export interface TurnSpan {
  span: Extract<PerfSpanName, `send_to_${string}`>;
  ms: number;
  ship: boolean;
}

const SHIPPED_OUTCOMES: ReadonlySet<FirstResponseOutcome> = new Set([
  "first_text",
  "timeout",
]);

export function turnSpans(response: FirstResponse): TurnSpan[] {
  const { outcome, sentAt, at, firstActivityAt } = response;
  const ship = SHIPPED_OUTCOMES.has(outcome);
  const spans: TurnSpan[] = [
    { span: "send_to_first_response", ms: at - sentAt, ship },
  ];
  const activityAt = firstActivityAt ?? (outcome === "timeout" ? at : null);
  if (activityAt !== null)
    spans.push({
      span: "send_to_first_activity",
      ms: activityAt - sentAt,
      ship,
    });
  return spans;
}

export function paintedSessionKey(
  sessionKey: string | null,
  feedLength: number,
): string | null {
  return sessionKey !== null && feedLength > 0 ? sessionKey : null;
}
