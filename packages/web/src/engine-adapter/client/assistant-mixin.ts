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
 * Reached with `gatewayAuthFetch` on `baseUrl`, like `capabilities()` and
 * `version()`: `/v1/assistant` is the HOST's (or the gateway's) own surface,
 * not the per-agent runtime protocol, and hosted mode rotates the bearer
 * mid-session so the live token must be read per attempt (HOU-687).
 */
export function AssistantMixin<TBase extends BaseCtor>(Base: TBase) {
  class Assistant extends Base {
    async getAssistant(): Promise<AssistantHandle> {
      const res = await controlPlane.gatewayAuthFetch(
        this.ctx.token,
        () => this.ctx.cp?.activeOrgSlug,
      )(`${this.ctx.baseUrl}/v1/assistant`);
      // No fallback address: a deployment that hosts no assistant answers 501,
      // and inventing an agent id here would send the user's chat somewhere
      // that does not exist. The caller surfaces the real failure.
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new HoustonEngineError(res.status, body);
      }
      return (await res.json()) as AssistantHandle;
    }
  }
  return Assistant;
}
