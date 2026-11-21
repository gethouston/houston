import {
  CHANNEL_PROVIDER_IDS,
  type ChannelConnection,
  type ChannelProvider,
  type ChannelStatus,
} from "@houston/engine-adapter";

export interface ChannelProviderCard {
  provider: ChannelProvider;
  connections: ChannelConnection[];
}

export function channelProviderCards(
  status: ChannelStatus,
): ChannelProviderCard[] {
  return CHANNEL_PROVIDER_IDS.flatMap((id) => {
    const provider = status.providers.find((item) => item.id === id);
    if (!provider) return [];
    const connections = status.connections.filter(
      (item) => item.provider === id,
    );
    return provider.configured || connections.length > 0
      ? [{ provider, connections }]
      : [];
  });
}

export type ChannelCardState =
  | { kind: "unavailable"; connections: ChannelConnection[] }
  | { kind: "empty" }
  | { kind: "connected"; connections: ChannelConnection[] };

export function channelCardState(
  connectable: boolean,
  connections: ChannelConnection[],
): ChannelCardState {
  if (!connectable) return { kind: "unavailable", connections };
  return connections.length > 0
    ? { kind: "connected", connections }
    : { kind: "empty" };
}
