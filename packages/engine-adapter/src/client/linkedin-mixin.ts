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
    async connectLinkedIn(
      returnTo?: LinkedInConnectReturn,
      signal?: AbortSignal,
    ): Promise<LinkedInConnectAnswer> {
      this.requireLinkedInGateway();
      return viaSdk("/v1/linkedin/connect", () =>
        this.ctx.sdk.linkedin.connect(returnTo, signal),
      );
    }
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
