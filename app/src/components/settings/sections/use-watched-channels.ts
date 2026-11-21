import type { ChannelProviderId } from "@houston/engine-adapter";
import {
  type ChannelWatches,
  pruneLandedWatches,
  watchChannel,
} from "@houston/sdk/channels/watch";
import { useEffect, useState } from "react";
import { useChannels } from "../../../hooks/queries/use-channels";

export function useWatchedChannels(
  onLanded: (provider: ChannelProviderId) => void,
) {
  const [watches, setWatches] = useState<ChannelWatches>({});
  const query = useChannels(watches);
  const connections = query.data?.connections ?? [];
  const landed = pruneLandedWatches(watches, connections).landed.join(" ");
  // biome-ignore lint/correctness/useExhaustiveDependencies: fires on the landing edge only; `onLanded` and `connections` are fresh each render.
  useEffect(() => {
    if (!landed) return;
    for (const provider of pruneLandedWatches(watches, connections).landed)
      onLanded(provider);
    setWatches((current) => pruneLandedWatches(current, connections).watches);
  }, [landed]);
  const watch = (provider: ChannelProviderId, expiresAt?: string) =>
    setWatches((current) =>
      watchChannel(current, provider, connections, Date.now(), expiresAt),
    );
  return { query, connections, watches, watch };
}
