import type { AssistantHandle } from "../../../../../ui/engine-client/src/types";
import * as controlPlane from "../control-plane";
import { HoustonEngineError } from "./errors";
import type { BaseCtor } from "./mixin";

/**
 * Personal-assistant discovery (`GET /v1/assistant`): which agent holds the
 * user's assistant and which conversation to open. The chat itself then rides
 * the ordinary per-agent methods on this same client — the assistant IS an
 * agent, so there is nothing else to add here.
 *
 * Routed through `cpFetch` like every other control-plane read, on the config
 * both deployments share (`prefConfig()`: the gateway in cloud, the local host
 * otherwise). That buys the live-bearer auth hosted mode needs (the token
 * rotates mid-session, HOU-687) AND the reason-aware read retry: discovery is
 * fired on mount, so it lands squarely on a gateway roll or a still-waking pod,
 * and the ladder rides those out instead of reporting the assistant absent.
 * A non-2xx arrives as a `HoustonEngineError` carrying the host's reason and
 * its `Retry-After` hint; `lib/assistant-availability.ts` classifies it, so no
 * fallback address is invented here — inventing an agent id would send the
 * user's chat somewhere that does not exist.
 *
 * A 2xx is not believed either until it names BOTH ids: the address is the one
 * thing the app cannot work out for itself, so a body that is missing it (an
 * intermediary's JSON, a half-written gateway answer) would open a chat pane
 * pointed at nothing at all, silently. It is reported as the 502 it is, which
 * `classifyAssistantDiscoveryFailure` reads as `unexpected` — the loud path.
 */
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
