/**
 * The morning-briefing wire shapes (`/v1/heartbeat`) and their guards. The
 * schemas live beside the stored document in `@houston/protocol`; here they
 * parse what a host answers before any surface renders it, so a mistyped
 * field is a refusal, never a silent default.
 */

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

/** `GET`/`PUT /v1/heartbeat`'s answer, checked. */
export function parseHeartbeatState(value: unknown): HeartbeatState {
  const parsed = HeartbeatStateSchema.safeParse(value);
  if (!parsed.success) throw new Error("Invalid heartbeat response");
  return parsed.data;
}

/** `POST /v1/heartbeat/run`'s answer, checked. */
export function parseHeartbeatRunResult(value: unknown): HeartbeatRunResult {
  const parsed = HeartbeatRunResultSchema.safeParse(value);
  if (!parsed.success) throw new Error("Invalid heartbeat run response");
  return parsed.data;
}

/** True for a `HH:MM` the host accepts. */
export function isHeartbeatTime(value: string): boolean {
  return HEARTBEAT_TIME_PATTERN.test(value);
}
