import type { SlackConnectReturnKind } from "@houston/wire-types";
import { requireString } from "../payload";

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

export const CHANNEL_PROVIDER_IDS = ["slack", "whatsapp"] as const;

export type ChannelProviderId = (typeof CHANNEL_PROVIDER_IDS)[number];

export interface ChannelConnection {
  id: string;
  provider: ChannelProviderId;
  accountLabel: string;
  spaceId: string;
  createdAt: string;
}

export interface ChannelProvider {
  id: ChannelProviderId;
  name: string;
  configured: boolean;
}

export interface ChannelStatus {
  providers: ChannelProvider[];
  connections: ChannelConnection[];
}

export interface ChannelLink {
  code: string;
  expiresAt: string;
}

export interface WhatsAppLink extends ChannelLink {
  phoneNumber: string;
  url: string;
}

export interface SlackAuthorization {
  url: string;
}

export interface SlackConnectAnswer extends SlackAuthorization {
  accepted: SlackConnectReturnKind | null;
}

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
