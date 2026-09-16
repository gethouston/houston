/**
 * The channels module — the messaging accounts a person's assistant answers
 * in: what is connected today, the two ways to connect Slack, and removal.
 *
 * These are pure commands over hosted-gateway routes: the listing is read when
 * the Channels screen opens and every other call is a button's one-shot, so
 * there is no reactive scope to publish and nothing here subscribes to an
 * event. The same handlers back both the typed facade and the bridge
 * `dispatch` path.
 *
 * SEAM — space-scoped, NOT per-agent. The gateway resolves the space from the
 * caller's session plus the active-space header its `fetch` stamps, and binds
 * the connection to the person's own assistant, so nothing here names an agent
 * and the module runs on its own {@link moduleScope} rooted at the base URL. A
 * 401 routes through the shared {@link ModuleContext.authExpiry} notifier.
 */

import type { ModuleContext } from "../../module-context";
import { moduleScope, SdkHttpError } from "../http";
import { requireString } from "../payload";
import {
  completeSlack,
  connectSlack,
  disconnectChannel,
  getChannels,
  linkSlack,
} from "./http";
import {
  type ChannelLink,
  type ChannelStatus,
  ChannelsCommand,
  requireTicket,
  type SlackAuthorization,
  type SlackCompletion,
} from "./types";

export type {
  ChannelConnection,
  ChannelLink,
  ChannelProvider,
  ChannelProviderId,
  ChannelStatus,
  ChannelsCommandType,
  SlackAuthorization,
  SlackCompletion,
} from "./types";
export { CHANNEL_PROVIDER_IDS, ChannelsCommand } from "./types";

/** The typed facade for the channels family. Every call throws on a non-2xx. */
export interface ChannelsModule {
  /** The deployment's providers and the active space's connections. */
  getChannels(signal?: AbortSignal): Promise<ChannelStatus>;
  /** Slack's hosted authorization URL for the person's browser to open. */
  connectSlack(signal?: AbortSignal): Promise<SlackAuthorization>;
  /** An expiring code that pairs an already-installed Slack workspace. */
  linkSlack(signal?: AbortSignal): Promise<ChannelLink>;
  /** Redeem the one-time ticket a Slack callback returned with. */
  completeSlack(ticket: string, signal?: AbortSignal): Promise<SlackCompletion>;
  /** Remove one connection, by the id `getChannels` returns. */
  disconnectChannel(connectionId: string, signal?: AbortSignal): Promise<void>;
}

/** A failed channels request. `status` is the upstream HTTP status. */
export class ChannelsHttpError extends SdkHttpError {
  constructor(message: string, status: number) {
    super(message, status, "ChannelsHttpError");
  }
}

export function createChannelsModule(ctx: ModuleContext): ChannelsModule {
  const scope = moduleScope(ctx, "channels", ChannelsHttpError);

  const module: ChannelsModule = {
    getChannels: (signal) => getChannels(scope, signal),
    connectSlack: (signal) => connectSlack(scope, signal),
    linkSlack: (signal) => linkSlack(scope, signal),
    completeSlack: (ticket, signal) => completeSlack(scope, ticket, signal),
    disconnectChannel: (connectionId, signal) =>
      disconnectChannel(scope, connectionId, signal),
  };

  ctx.registerCommand(ChannelsCommand.Get, () => module.getChannels());
  ctx.registerCommand(ChannelsCommand.ConnectSlack, () =>
    module.connectSlack(),
  );
  ctx.registerCommand(ChannelsCommand.LinkSlack, () => module.linkSlack());
  ctx.registerCommand(ChannelsCommand.CompleteSlack, (p) =>
    module.completeSlack(requireTicket(p, "ticket")),
  );
  ctx.registerCommand(ChannelsCommand.Disconnect, (p) =>
    module.disconnectChannel(requireString(p, "connectionId")),
  );

  return module;
}
