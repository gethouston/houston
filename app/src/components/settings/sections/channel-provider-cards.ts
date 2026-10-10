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
    return provider
      ? [
          {
            provider,
            connections: status.connections.filter(
              (item) => item.provider === id,
            ),
          },
        ]
      : [];
  });
}
