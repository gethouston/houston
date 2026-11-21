import {
  HEARTBEAT_TIME_PATTERN,
  type HeartbeatRunResult,
  HeartbeatRunResultSchema,
  type HeartbeatState,
  HeartbeatStateSchema,
} from "@houston/protocol";

export type {
  HeartbeatLast,
  HeartbeatRunResult,
  HeartbeatSettings,
  HeartbeatSettingsPatch,
  HeartbeatState,
} from "@houston/protocol";
export {
  DEFAULT_HEARTBEAT_SETTINGS,
  HEARTBEAT_TIME_PATTERN,
  HeartbeatRefusalCode,
  HeartbeatRunStatus,
} from "@houston/protocol";

export function parseHeartbeatState(value: unknown): HeartbeatState {
  const parsed = HeartbeatStateSchema.safeParse(value);
  if (!parsed.success) throw new Error("Invalid heartbeat response");
  return parsed.data;
}

export function parseHeartbeatRunResult(value: unknown): HeartbeatRunResult {
  const parsed = HeartbeatRunResultSchema.safeParse(value);
  if (!parsed.success) throw new Error("Invalid heartbeat run response");
  return parsed.data;
}

export function isHeartbeatTime(value: string): boolean {
  return HEARTBEAT_TIME_PATTERN.test(value);
}
