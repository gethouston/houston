import type { SlackConnectReturnKind } from "@houston/wire-types";
import { requireString } from "../payload";

/** The write vocabulary — the same handlers back the facade and `dispatch`. */
export const ChannelsCommand = {
  Get: "channels/get",
  ConnectSlack: "channels/connectSlack",
  LinkSlack: "channels/linkSlack",
  LinkWhatsApp: "channels/linkWhatsApp",
  CompleteSlack: "channels/completeSlack",
  Disconnect: "channels/disconnect",
} as const;

export type ChannelsCommandType =
  (typeof ChannelsCommand)[keyof typeof ChannelsCommand];

/**
 * The runtime mirror of the messaging providers a surface can render — a
 * command payload arrives untyped, and a union is not a value to check it
 * against. A provider the gateway starts offering must be added here too.
 */
export const CHANNEL_PROVIDER_IDS = ["slack", "whatsapp"] as const;

export type ChannelProviderId = (typeof CHANNEL_PROVIDER_IDS)[number];

/** One messaging identity bound to the caller's personal assistant. */
export interface ChannelConnection {
  id: string;
  provider: ChannelProviderId;
  accountLabel: string;
  spaceId: string;
  createdAt: string;
}

/** A provider the deployment knows, and whether it is configured to run. */
export interface ChannelProvider {
  id: ChannelProviderId;
  name: string;
  configured: boolean;
}

export interface ChannelStatus {
  providers: ChannelProvider[];
  connections: ChannelConnection[];
}

/** The expiring code a person types at an already-installed Slack workspace. */
export interface ChannelLink {
  code: string;
  expiresAt: string;
}

export interface WhatsAppLink extends ChannelLink {
  phoneNumber: string;
  url: string;
}

/** Slack's own authorization endpoint, for the person's browser to open. */
export interface SlackAuthorization {
  url: string;
}

/**
 * A connect's answer: the authorization URL, and the return the gateway took
 * for it. `null` is the web app (none named). It differs from the one asked
 * for only when the gateway refused a `loopback` return and the
 * connect fell back to `app`, which leaves the desktop listener unused.
 */
export interface SlackConnectAnswer extends SlackAuthorization {
  accepted: SlackConnectReturnKind | null;
}

/** What the gateway bound when it redeemed a completion ticket. */
export interface SlackCompletion {
  connection: ChannelConnection;
}

const SLACK_TICKET = /^[A-Za-z0-9._~-]{8,256}$/;

export function requireTicket(payload: unknown, key: string): string {
  const value = requireString(payload, key);
  if (!SLACK_TICKET.test(value)) {
    throw new Error(`'${key}' is not a completion ticket`);
  }
  return value;
}
