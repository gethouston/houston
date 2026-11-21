import {
  HEARTBEAT_TIME_PATTERN,
  HeartbeatRefusalCode,
  type HeartbeatSettingsPatch,
} from "@houston/protocol";
import { field } from "../payload";
import { refusalCode, refusalStatus } from "../refusal-code";

export type {
  HeartbeatLast,
  HeartbeatRunResult,
  HeartbeatSettings,
  HeartbeatSettingsPatch,
  HeartbeatState,
} from "@houston/protocol";

export const HeartbeatCommand = {
  Get: "heartbeat/get",
  Set: "heartbeat/set",
  RunNow: "heartbeat/runNow",
} as const;

export type HeartbeatCommandType =
  (typeof HeartbeatCommand)[keyof typeof HeartbeatCommand];

export type HeartbeatFailure =
  | { kind: "turn_running" }
  | { kind: "failed" }
  | { kind: "unavailable" }
  | { kind: "unexpected" };

export function classifyHeartbeatFailure(error: unknown): HeartbeatFailure {
  if (!(error instanceof Error)) return { kind: "unexpected" };
  const code = refusalCode(error);
  if (code === HeartbeatRefusalCode.TurnRunning)
    return { kind: "turn_running" };
  if (code === HeartbeatRefusalCode.Failed) return { kind: "failed" };
  if (
    code === HeartbeatRefusalCode.GatewayOnly ||
    code === HeartbeatRefusalCode.Unavailable ||
    refusalStatus(error) === 501
  )
    return { kind: "unavailable" };
  return { kind: "unexpected" };
}

export function requireHeartbeatPatch(
  payload: unknown,
): HeartbeatSettingsPatch {
  const enabled = field(payload, "enabled");
  const time = field(payload, "time");
  if (enabled !== undefined && typeof enabled !== "boolean")
    throw new Error("'enabled' must be a boolean");
  if (
    time !== undefined &&
    (typeof time !== "string" || !HEARTBEAT_TIME_PATTERN.test(time))
  )
    throw new Error("'time' must be HH:MM on a 24-hour clock");
  return {
    ...(enabled !== undefined ? { enabled } : {}),
    ...(time !== undefined ? { time } : {}),
  };
}
