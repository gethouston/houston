import type {
  PushDeviceRegistration,
  PushDeviceResponse,
} from "@houston/wire-types";
import { pushDeviceResponseSchema } from "@houston/wire-types";
import { HoustonEngineError } from "./errors";
import type { BaseCtor } from "./mixin";
import { viaSdk } from "./sdk-error";

export function PushMixin<TBase extends BaseCtor>(Base: TBase) {
  class Push extends Base {
    private requirePushGateway(): void {
      if (!this.ctx.cp) throw new HoustonEngineError(501, null);
    }
    pushDeviceId(): Promise<string> {
      return this.ctx.sdk.push.deviceId();
    }
    async registerPushDevice(
      id: string,
      input: PushDeviceRegistration,
      signal?: AbortSignal,
    ): Promise<PushDeviceResponse> {
      this.requirePushGateway();
      return pushDeviceResponseSchema.parse(
        await viaSdk(`/v1/me/push/devices/${encodeURIComponent(id)}`, () =>
          this.ctx.sdk.push.registerDevice(id, input, signal),
        ),
      );
    }
    async unregisterPushDevice(
      id: string,
      signal?: AbortSignal,
    ): Promise<void> {
      this.requirePushGateway();
      await viaSdk(`/v1/me/push/devices/${encodeURIComponent(id)}`, () =>
        this.ctx.sdk.push.unregisterDevice(id, signal),
      );
    }
    async reportPushPresence(
      foreground: boolean,
      signal?: AbortSignal,
    ): Promise<void> {
      this.requirePushGateway();
      await viaSdk("/v1/me/push/presence", () =>
        this.ctx.sdk.push.reportPresence(foreground, signal),
      );
    }
    startPushPresence(
      foreground: () => boolean,
      onError: (error: unknown) => void,
    ): () => void {
      this.requirePushGateway();
      return this.ctx.sdk.push.startPresence(foreground, onError);
    }
  }
  return Push;
}
