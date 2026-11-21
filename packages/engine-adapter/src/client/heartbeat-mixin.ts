import {
  type HeartbeatRunResult,
  type HeartbeatSettingsPatch,
  type HeartbeatState,
  parseHeartbeatRunResult,
  parseHeartbeatState,
} from "@houston/wire-types";
import type { BaseCtor } from "./mixin";
import { viaSdk } from "./sdk-error";

export function HeartbeatMixin<TBase extends BaseCtor>(Base: TBase) {
  class Heartbeat extends Base {
    async getHeartbeat(signal?: AbortSignal): Promise<HeartbeatState> {
      return parseHeartbeatState(
        await viaSdk("/v1/heartbeat", () =>
          this.ctx.sdk.heartbeat.getHeartbeat(signal),
        ),
      );
    }
    async setHeartbeat(
      patch: HeartbeatSettingsPatch,
      signal?: AbortSignal,
    ): Promise<HeartbeatState> {
      return parseHeartbeatState(
        await viaSdk("/v1/heartbeat", () =>
          this.ctx.sdk.heartbeat.setHeartbeat(patch, signal),
        ),
      );
    }
    async runHeartbeatNow(signal?: AbortSignal): Promise<HeartbeatRunResult> {
      return parseHeartbeatRunResult(
        await viaSdk("/v1/heartbeat/run", () =>
          this.ctx.sdk.heartbeat.runHeartbeatNow(signal),
        ),
      );
    }
  }
  return Heartbeat;
}
