import type { SlackConnectReturn } from "@houston/wire-types";
import type { ModuleContext } from "../../module-context";
import { moduleScope, SdkHttpError } from "../http";
import { field, requireString } from "../payload";
import { parseSlackConnectReturn } from "./connect-return";
import {
  completeSlack,
  connectSlack,
  disconnectChannel,
  getChannels,
  linkSlack,
  linkWhatsApp,
} from "./http";
import {
  type ChannelLink,
  type ChannelStatus,
  ChannelsCommand,
  requireTicket,
  type SlackCompletion,
  type SlackConnectAnswer,
  type WhatsAppLink,
} from "./types";

export type {
  SlackConnectReturn,
  SlackConnectReturnKind,
} from "@houston/wire-types";
export type {
  ChannelConnection,
  ChannelLink,
  ChannelProvider,
  ChannelProviderId,
  ChannelStatus,
  ChannelsCommandType,
  SlackAuthorization,
  SlackCompletion,
  SlackConnectAnswer,
  WhatsAppLink,
} from "./types";
export { CHANNEL_PROVIDER_IDS, ChannelsCommand } from "./types";

export interface ChannelsModule {
  getChannels(signal?: AbortSignal): Promise<ChannelStatus>;
  connectSlack(
    returnTo?: SlackConnectReturn,
    signal?: AbortSignal,
  ): Promise<SlackConnectAnswer>;
  linkSlack(signal?: AbortSignal): Promise<ChannelLink>;
  linkWhatsApp(signal?: AbortSignal): Promise<WhatsAppLink>;
  completeSlack(ticket: string, signal?: AbortSignal): Promise<SlackCompletion>;
  disconnectChannel(connectionId: string, signal?: AbortSignal): Promise<void>;
}

export class ChannelsHttpError extends SdkHttpError {
  constructor(message: string, status: number) {
    super(message, status, "ChannelsHttpError");
  }
}

export function createChannelsModule(ctx: ModuleContext): ChannelsModule {
  const scope = moduleScope(ctx, "channels", ChannelsHttpError);

  const module: ChannelsModule = {
    getChannels: (signal) => getChannels(scope, signal),
    connectSlack: (returnTo, signal) => connectSlack(scope, returnTo, signal),
    linkSlack: (signal) => linkSlack(scope, signal),
    linkWhatsApp: (signal) => linkWhatsApp(scope, signal),
    completeSlack: (ticket, signal) => completeSlack(scope, ticket, signal),
    disconnectChannel: (connectionId, signal) =>
      disconnectChannel(scope, connectionId, signal),
  };

  ctx.registerCommand(ChannelsCommand.Get, () => module.getChannels());
  ctx.registerCommand(ChannelsCommand.ConnectSlack, (p) =>
    module.connectSlack(parseSlackConnectReturn(field(p, "returnTo"))),
  );
  ctx.registerCommand(ChannelsCommand.LinkSlack, () => module.linkSlack());
  ctx.registerCommand(ChannelsCommand.LinkWhatsApp, () =>
    module.linkWhatsApp(),
  );
  ctx.registerCommand(ChannelsCommand.CompleteSlack, (p) =>
    module.completeSlack(requireTicket(p, "ticket")),
  );
  ctx.registerCommand(ChannelsCommand.Disconnect, (p) =>
    module.disconnectChannel(requireString(p, "connectionId")),
  );

  return module;
}
