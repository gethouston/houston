import type { SlackConnectAnswer } from "@houston/sdk";
import {
  type ChannelConnection,
  type ChannelLink,
  type ChannelStatus,
  parseChannelLink,
  parseChannelStatus,
  parseSlackAuthorization,
  parseSlackCompletion,
  parseWhatsAppLink,
  type SlackConnectReturn,
  slackTicket,
  type WhatsAppLink,
} from "@houston/wire-types";
import { HoustonEngineError } from "./errors";
import type { BaseCtor } from "./mixin";
import { viaSdk } from "./sdk-error";

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
    async connectSlack(
      returnTo?: SlackConnectReturn,
      signal?: AbortSignal,
    ): Promise<SlackConnectAnswer> {
      this.requireGateway();
      const answer = await viaSdk("/v1/channels/slack/connect", () =>
        this.ctx.sdk.channels.connectSlack(returnTo, signal),
      );
      return {
        url: parseSlackAuthorization(answer),
        accepted: answer.accepted,
      };
    }
    async linkSlack(signal?: AbortSignal): Promise<ChannelLink> {
      this.requireGateway();
      return parseChannelLink(
        await viaSdk("/v1/channels/slack/link", () =>
          this.ctx.sdk.channels.linkSlack(signal),
        ),
      );
    }
    async linkWhatsApp(signal?: AbortSignal): Promise<WhatsAppLink> {
      this.requireGateway();
      return parseWhatsAppLink(
        await viaSdk("/v1/channels/whatsapp/link", () =>
          this.ctx.sdk.channels.linkWhatsApp(signal),
        ),
      );
    }
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
