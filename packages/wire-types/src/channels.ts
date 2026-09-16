/**
 * The channels wire shapes and their guards. Every value the gateway returns is
 * parsed here before any surface sees it: an absent or mistyped field is a
 * refusal, never a silent default, and nothing but Slack's own authorization
 * endpoint is ever handed to a browser.
 */

/** The messaging providers this app knows how to render. */
export const CHANNEL_PROVIDER_IDS = ["slack"] as const;

export type ChannelProviderId = (typeof CHANNEL_PROVIDER_IDS)[number];

/** Messaging identities connected to the caller's personal assistant. */
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

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid channels response");
  }
  return value as Record<string, unknown>;
}

function isChannelProviderId(value: unknown): value is ChannelProviderId {
  return CHANNEL_PROVIDER_IDS.includes(value as ChannelProviderId);
}

/** A named provider this app has no screen for — dropped from a listing. */
function unknownProvider(value: unknown): boolean {
  return typeof value === "string" && !isChannelProviderId(value);
}

/** A provider this app cannot render is not one it may claim to speak for. */
function providerId(value: unknown): ChannelProviderId {
  if (!isChannelProviderId(value)) {
    throw new Error("Unknown channel provider");
  }
  return value;
}

function field(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Invalid channels response field");
  }
  return value;
}

export function parseChannelConnection(value: unknown): ChannelConnection {
  const item = record(value);
  return {
    id: field(item.id),
    provider: providerId(item.provider),
    accountLabel: field(item.accountLabel),
    spaceId: field(item.spaceId),
    createdAt: field(item.createdAt),
  };
}

export function parseChannelStatus(value: unknown): ChannelStatus {
  const data = record(value);
  if (!Array.isArray(data.providers) || !Array.isArray(data.connections)) {
    throw new Error("Invalid channels list response");
  }
  // A gateway may serve a provider this app predates: that row is dropped, so
  // one unknown id cannot blank the whole section. A row with no provider id
  // at all is malformed, and malformed is still a refusal.
  return {
    providers: data.providers.flatMap((value) => {
      const item = record(value);
      if (unknownProvider(item.id)) return [];
      if (typeof item.configured !== "boolean") {
        throw new Error("Invalid channels provider readiness");
      }
      return [
        {
          id: providerId(item.id),
          name: field(item.name),
          configured: item.configured,
        },
      ];
    }),
    connections: data.connections.flatMap((value) =>
      unknownProvider(record(value).provider)
        ? []
        : [parseChannelConnection(value)],
    ),
  };
}

/**
 * The gateway's one-time completion ticket, as it came back on the callback
 * URL. Opaque on purpose: this checks the SHAPE only, so a truncated or
 * tampered link is refused before it leaves the app, and the value itself is
 * never logged, stored or sent anywhere but the completion route.
 */
export function slackTicket(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9._~-]{8,256}$/.test(value)) {
    throw new Error("Invalid Slack completion ticket");
  }
  return value;
}

/** Only Slack's HTTPS authorization endpoint may leave the application. */
export function slackAuthorizationUrl(value: unknown): string {
  const url = new URL(field(value));
  if (
    url.protocol !== "https:" ||
    url.hostname !== "slack.com" ||
    url.port ||
    url.username ||
    url.password ||
    url.pathname !== "/oauth/v2/authorize"
  ) {
    throw new Error("Invalid Slack authorization URL");
  }
  return url.href;
}

export function channelConnectCommand(code: string): string {
  if (!/^[A-Za-z0-9-]{6,128}$/.test(code)) {
    throw new Error("Invalid channel connection code");
  }
  return `connect ${code}`;
}

/** The authorization URL a connect hands the browser, guarded before it opens. */
export function parseSlackAuthorization(value: unknown): string {
  return slackAuthorizationUrl(record(value).url);
}

/** The connection the gateway bound when it redeemed a completion ticket. */
export function parseSlackCompletion(value: unknown): ChannelConnection {
  return parseChannelConnection(record(value).connection);
}

export function parseChannelLink(value: unknown): ChannelLink {
  const data = record(value);
  const code = field(data.code);
  // The code is shown to be typed into Slack, so it is held to the command's
  // own alphabet here rather than at the copy button.
  channelConnectCommand(code);
  const expiresAt = field(data.expiresAt);
  if (!Number.isFinite(Date.parse(expiresAt))) {
    throw new Error("Invalid channel link expiration");
  }
  return { code, expiresAt };
}

/** One connection's path segment, guarded and escaped for the DELETE route. */
export function channelConnectionSegment(id: string): string {
  return encodeURIComponent(field(id));
}
