import type {
  FirstDayStartInput,
  FirstDayStartResult,
} from "@houston/wire-types";
import { emitLocalEcho } from "../bus";
import * as controlPlane from "../control-plane";
import type { BaseCtor } from "./mixin";
import { viaSdk } from "./sdk-error";

/**
 * An AI Employee's first day (`@houston/sdk`'s agents module): the one start
 * every surface binds. The host creates the setup task, fires its first turn
 * and records the start, so this only carries the request and echoes the two
 * documents the start wrote, ahead of the host's own events.
 */
export function FirstDayMixin<TBase extends BaseCtor>(Base: TBase) {
  class FirstDay extends Base {
    async startFirstDay(
      agentPath: string,
      input: FirstDayStartInput,
    ): Promise<FirstDayStartResult> {
      if (!this.ctx.cp)
        throw new Error("Starting a first day needs a connected host.");
      const result = await viaSdk(
        `${controlPlane.agentPath(agentPath)}/first-day`,
        () => this.ctx.sdk.agents.startFirstDay(agentPath, input),
      );
      emitLocalEcho("ActivityChanged", { agentPath });
      emitLocalEcho("ConfigChanged", { agentPath });
      return result;
    }
  }
  return FirstDay;
}
