import { classifyHeartbeatFailure } from "@houston/sdk";
import type {
  HeartbeatRunResult,
  HeartbeatSettingsPatch,
  HeartbeatState,
} from "@houston/wire-types";
import { getEngine } from "./engine";
import { engineCall } from "./tauri";

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
