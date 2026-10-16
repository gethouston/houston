import type {
  LinkedInCompletion,
  LinkedInConnectAnswer,
  LinkedInConnection,
  LinkedInConnectReturn,
  LinkedInPostInput,
  LinkedInPostResult,
} from "@houston/sdk";
import { linkedInTicket } from "@houston/wire-types";
import { HoustonEngineError } from "./errors";
import type { BaseCtor } from "./mixin";
import { viaSdk } from "./sdk-error";

/**
 * Posting to the person's own LinkedIn: the gateway's `/v1/linkedin/*`
 * family, delegated to `sdk.linkedin`, which parses every answer and types
 * every refusal.
 *
 * Off the gateway (`this.ctx.cp === null`) there is no LinkedIn at all: the
 * reads throw a 501 the share dialog reads as "share by copy and paste", and
 * a post is refused `not_configured` without a request.
 */
export function LinkedInMixin<TBase extends BaseCtor>(Base: TBase) {
  class LinkedIn extends Base {
    private requireLinkedInGateway(): void {
      if (!this.ctx.cp) throw new HoustonEngineError(501, null);
    }
    async linkedInConnection(
      signal?: AbortSignal,
    ): Promise<LinkedInConnection> {
      this.requireLinkedInGateway();
      return viaSdk("/v1/linkedin/connection", () =>
        this.ctx.sdk.linkedin.connection(signal),
      );
    }
    /** LinkedIn's authorization page, for the person's browser to open. */
    async connectLinkedIn(
      returnTo?: LinkedInConnectReturn,
      signal?: AbortSignal,
    ): Promise<LinkedInConnectAnswer> {
      this.requireLinkedInGateway();
      return viaSdk("/v1/linkedin/connect", () =>
        this.ctx.sdk.linkedin.connect(returnTo, signal),
      );
    }
    /**
     * Redeem the callback's ticket: what BINDS the LinkedIn account to the
     * signed-in person. A mangled ticket never becomes a request.
     */
    async completeLinkedIn(
      ticket: string,
      signal?: AbortSignal,
    ): Promise<LinkedInCompletion> {
      this.requireLinkedInGateway();
      const checked = linkedInTicket(ticket);
      return viaSdk("/v1/linkedin/connect/complete", () =>
        this.ctx.sdk.linkedin.complete(checked, signal),
      );
    }
    async disconnectLinkedIn(signal?: AbortSignal): Promise<void> {
      this.requireLinkedInGateway();
      await viaSdk("/v1/linkedin/connection", () =>
        this.ctx.sdk.linkedin.disconnect(signal),
      );
    }
    async postLinkedInImage(
      input: LinkedInPostInput,
    ): Promise<LinkedInPostResult> {
      if (!this.ctx.cp) return { kind: "refused", code: "not_configured" };
      return viaSdk("/v1/linkedin/posts", () =>
        this.ctx.sdk.linkedin.postImage(input),
      );
    }
  }
  return LinkedIn;
}
