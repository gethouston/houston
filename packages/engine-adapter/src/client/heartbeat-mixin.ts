import {
  type HeartbeatRunResult,
  type HeartbeatSettingsPatch,
  type HeartbeatState,
  parseHeartbeatRunResult,
  parseHeartbeatState,
} from "@houston/wire-types";
import type { BaseCtor } from "./mixin";
import { viaSdk } from "./sdk-error";

/**
 * The AI Manager's morning briefing (`/v1/heartbeat*`), delegated to
 * `sdk.heartbeat`. Every answer is parsed before it leaves this seam
 * (`@houston/wire-types`), so a malformed host answer is a refusal rather
 * than a settings row rendering garbage.
 *
 * Served by the open host only (`capabilities.heartbeat`); the app hides the
 * row elsewhere, and a deployment that answers anyway with 501 surfaces as the
 * `HoustonEngineError` the SDK's classifier reads as "unavailable".
 */
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
