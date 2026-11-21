import type { AssistantHandle } from "@houston/wire-types";
import * as controlPlane from "../control-plane";
import { HoustonEngineError } from "./errors";
import type { BaseCtor } from "./mixin";

export function AssistantMixin<TBase extends BaseCtor>(Base: TBase) {
  class Assistant extends Base {
    /** Finds the user's personal assistant: which agent holds it, and which conversation to open.
     * @assistant group:system hidden: the assistant IS this agent, so where it lives tells it nothing it can act on. */
    async getAssistant(): Promise<AssistantHandle> {
      const res = await controlPlane.cpFetch(
        this.ctx.prefConfig(),
        "/v1/assistant",
      );
      const body: unknown = await res.json();
      const handle = body as Partial<AssistantHandle> | null;
      if (
        typeof handle?.agent !== "string" ||
        handle.agent === "" ||
        typeof handle.conversation !== "string" ||
        handle.conversation === ""
      )
        throw new HoustonEngineError(502, {
          error: "the assistant address is missing from the host's answer",
          code: "assistant_malformed",
        });
      return { agent: handle.agent, conversation: handle.conversation };
    }
  }
  return Assistant;
}
