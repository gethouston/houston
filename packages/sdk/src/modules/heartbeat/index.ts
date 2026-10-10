/**
 * The heartbeat module: the AI Manager's daily morning briefing. Its settings
 * (on/off, the time), its last run, and "brief me now".
 *
 * Pure commands: the settings are read when the screen opens and every write
 * is a button's one-shot; the surface refreshes on the host's
 * `HeartbeatChanged` event, so there is no reactive scope here. The same
 * handlers back the typed facade and the `dispatch` path.
 *
 * SEAM: user-scoped, NOT per-agent. The host resolves the person's personal
 * workspace (where the manager lives) from the session, so nothing here names
 * an agent and the module runs on its own {@link moduleScope}.
 */

import type { ModuleContext } from "../../module-context";
import { moduleScope, SdkHttpError } from "../http";
import { getHeartbeat, runHeartbeatNow, setHeartbeat } from "./http";
import {
  HeartbeatCommand,
  type HeartbeatRunResult,
  type HeartbeatSettingsPatch,
  type HeartbeatState,
  requireHeartbeatPatch,
} from "./types";

export type {
  HeartbeatCommandType,
  HeartbeatFailure,
  HeartbeatLast,
  HeartbeatRunResult,
  HeartbeatSettings,
  HeartbeatSettingsPatch,
  HeartbeatState,
} from "./types";
export { classifyHeartbeatFailure, HeartbeatCommand } from "./types";

/** The typed facade for the heartbeat family. Every call throws on a non-2xx. */
export interface HeartbeatModule {
  getHeartbeat(signal?: AbortSignal): Promise<HeartbeatState>;
  setHeartbeat(
    patch: HeartbeatSettingsPatch,
    signal?: AbortSignal,
  ): Promise<HeartbeatState>;
  runHeartbeatNow(signal?: AbortSignal): Promise<HeartbeatRunResult>;
}

/** A failed heartbeat request. `status` is the upstream HTTP status. */
export class HeartbeatHttpError extends SdkHttpError {
  constructor(message: string, status: number) {
    super(message, status, "HeartbeatHttpError");
  }
}

export function createHeartbeatModule(ctx: ModuleContext): HeartbeatModule {
  const scope = moduleScope(ctx, "heartbeat", HeartbeatHttpError);

  const module: HeartbeatModule = {
    getHeartbeat: (signal) => getHeartbeat(scope, signal),
    setHeartbeat: (patch, signal) => setHeartbeat(scope, patch, signal),
    runHeartbeatNow: (signal) => runHeartbeatNow(scope, signal),
  };

  ctx.registerCommand(HeartbeatCommand.Get, () => module.getHeartbeat());
  ctx.registerCommand(HeartbeatCommand.Set, (p) =>
    module.setHeartbeat(requireHeartbeatPatch(p)),
  );
  ctx.registerCommand(HeartbeatCommand.RunNow, () => module.runHeartbeatNow());

  return module;
}
