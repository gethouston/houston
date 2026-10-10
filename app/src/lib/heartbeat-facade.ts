import { classifyHeartbeatFailure } from "@houston/sdk";
import type {
  HeartbeatRunResult,
  HeartbeatSettingsPatch,
  HeartbeatState,
} from "@houston/wire-types";
import { getEngine } from "./engine";
import { engineCall } from "./tauri";

/**
 * The AI Manager's morning briefing (Settings > Notifications). The two
 * states of "brief me now" a person can act on (the manager mid-turn, a turn
 * that could not start for want of an AI account) are silenced here and told
 * by the caller with authored copy; anything else takes the default path.
 */
const actionable = (err: unknown) => {
  const { kind } = classifyHeartbeatFailure(err);
  return kind === "turn_running" || kind === "failed";
};

export const tauriHeartbeat = {
  get: (signal?: AbortSignal) =>
    engineCall<HeartbeatState>("get_heartbeat", () =>
      getEngine().getHeartbeat(signal),
    ),
  set: (patch: HeartbeatSettingsPatch) =>
    engineCall<HeartbeatState>("set_heartbeat", () =>
      getEngine().setHeartbeat(patch),
    ),
  runNow: () =>
    engineCall<HeartbeatRunResult>(
      "run_heartbeat_now",
      () => getEngine().runHeartbeatNow(),
      undefined,
      { silence: actionable },
    ),
};
