/**
 * Wire types + command vocabulary for the channels module — the messaging
 * accounts a person connects to their personal assistant, in the space they
 * are working in.
 *
 * Everything here is plain JSON, so it crosses the bridge's `dispatch`
 * boundary unchanged. There is no reactive scope: the listing is read when the
 * Channels screen opens and every other call is a button's one-shot, so the
 * module is plain-async and publishes nothing (the billing module's shape).
 *
 * The app-facing copy of these shapes, with the guards that parse a gateway
 * answer before a surface renders it, is `@houston/wire-types`. This package
 * does not depend on it, so the shapes are declared here too and the two are
 * kept in step by hand, exactly like `BillingSummary`.
 */

import { requireString } from "../payload";

/** The write vocabulary — the same handlers back the facade and the bridge. */
export const ChannelsCommand = {
  Get: "channels/get",
  ConnectSlack: "channels/connectSlack",
  LinkSlack: "channels/linkSlack",
  CompleteSlack: "channels/completeSlack",
  Disconnect: "channels/disconnect",
} as const;

export type ChannelsCommandType =
  (typeof ChannelsCommand)[keyof typeof ChannelsCommand];

/**
 * The runtime mirror of the messaging providers a surface can render — a
 * bridge payload arrives untyped, and a union is not a value to check it
 * against. A provider the gateway starts offering must be added here too.
 */
export const CHANNEL_PROVIDER_IDS = ["slack"] as const;

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

/** Slack's own authorization endpoint, for the person's browser to open. */
export interface SlackAuthorization {
  url: string;
}

/** What the gateway bound when it redeemed a completion ticket. */
export interface SlackCompletion {
  connection: ChannelConnection;
}

/** The shape of the gateway's one-time completion ticket. */
const SLACK_TICKET = /^[A-Za-z0-9._~-]{8,256}$/;

/**
 * A completion ticket off an untrusted command payload. Opaque on purpose:
 * this checks the SHAPE only, so a truncated or tampered callback link is
 * refused before it leaves the device, and the value itself is never logged,
 * stored or sent anywhere but the completion route.
 */
export function requireTicket(payload: unknown, key: string): string {
  const value = requireString(payload, key);
  if (!SLACK_TICKET.test(value)) {
    throw new Error(`'${key}' is not a completion ticket`);
  }
  return value;
}
