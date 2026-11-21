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

export interface HeartbeatModule {
  getHeartbeat(signal?: AbortSignal): Promise<HeartbeatState>;
  setHeartbeat(
    patch: HeartbeatSettingsPatch,
    signal?: AbortSignal,
  ): Promise<HeartbeatState>;
  runHeartbeatNow(signal?: AbortSignal): Promise<HeartbeatRunResult>;
}

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
