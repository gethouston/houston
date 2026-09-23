import {
  type ChannelConnection,
  type ChannelLink,
  type ChannelStatus,
  parseChannelLink,
  parseChannelStatus,
  parseSlackAuthorization,
  parseSlackCompletion,
  slackTicket,
} from "@houston/wire-types";
import { HoustonEngineError } from "./errors";
import type { BaseCtor } from "./mixin";
import { viaSdk } from "./sdk-error";

/**
 * The messaging accounts the personal assistant answers in — the gateway's
 * `/v1/channels*` family, delegated to `sdk.channels`.
 *
 * Every answer is parsed before it leaves this seam (`@houston/wire-types`):
 * an absent or mistyped field is a refusal rather than a silent default, and
 * the only URL this app ever hands a browser is Slack's own authorization
 * endpoint. The SDK stays honest about the wire; the guard lives here, where
 * the value actually reaches a screen and a browser.
 *
 * Off the gateway (`this.ctx.cp === null`) there is no channels concept at
 * all, and the section reads a 501 as "this deployment has no channels" —
 * which is why nothing degrades to an empty listing a caller could not tell
 * from a real one.
 */
export function ChannelsMixin<TBase extends BaseCtor>(Base: TBase) {
  class Channels extends Base {
    private requireGateway(): void {
      if (!this.ctx.cp) throw new HoustonEngineError(501, null);
    }
    async getChannels(signal?: AbortSignal): Promise<ChannelStatus> {
      this.requireGateway();
      return parseChannelStatus(
        await viaSdk("/v1/channels", () =>
          this.ctx.sdk.channels.getChannels(signal),
        ),
      );
    }
    async connectSlack(signal?: AbortSignal): Promise<string> {
      this.requireGateway();
      return parseSlackAuthorization(
        await viaSdk("/v1/channels/slack/connect", () =>
          this.ctx.sdk.channels.connectSlack(signal),
        ),
      );
    }
    async linkSlack(signal?: AbortSignal): Promise<ChannelLink> {
      this.requireGateway();
      return parseChannelLink(
        await viaSdk("/v1/channels/slack/link", () =>
          this.ctx.sdk.channels.linkSlack(signal),
        ),
      );
    }
    /**
     * Redeem the callback ticket. This is what BINDS the Slack account to the
     * signed-in user, so it runs on the app's own credential rather than off
     * Slack's redirect, whose completer is nobody in particular. A mangled
     * link never becomes a request.
     */
    async completeSlack(
      ticket: string,
      signal?: AbortSignal,
    ): Promise<ChannelConnection> {
      this.requireGateway();
      const checked = slackTicket(ticket);
      return parseSlackCompletion(
        await viaSdk("/v1/channels/slack/complete", () =>
          this.ctx.sdk.channels.completeSlack(checked, signal),
        ),
      );
    }
    async disconnectChannel(id: string, signal?: AbortSignal): Promise<void> {
      this.requireGateway();
      await viaSdk(`/v1/channels/connections/${encodeURIComponent(id)}`, () =>
        this.ctx.sdk.channels.disconnectChannel(id, signal),
      );
    }
  }
  return Channels;
}
