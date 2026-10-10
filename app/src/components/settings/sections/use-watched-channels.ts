import type { ChannelProviderId } from "@houston/engine-adapter";
import {
  type ChannelWatches,
  pruneLandedWatches,
  watchChannel,
} from "@houston/sdk/channels/watch";
import { useEffect, useState } from "react";
import { useChannels } from "../../../hooks/queries/use-channels";

/**
 * The channels list, polled while the Channels section has a hand-off
 * outstanding. The watch rules are the SDK's (`@houston/sdk/channels/watch`);
 * this only stores the record and tells the section which providers landed,
 * so it can clear what each hand-off left on screen.
 */
export function useWatchedChannels(
  onLanded: (provider: ChannelProviderId) => void,
) {
  const [watches, setWatches] = useState<ChannelWatches>({});
  const query = useChannels(watches);
  const connections = query.data?.connections ?? [];
  // One string, so the effect fires on the landing edge, not every render.
  const landed = pruneLandedWatches(watches, connections).landed.join(" ");
  // biome-ignore lint/correctness/useExhaustiveDependencies: fires on the landing edge only; `onLanded` and `connections` are fresh each render.
  useEffect(() => {
    if (!landed) return;
    for (const provider of pruneLandedWatches(watches, connections).landed)
      onLanded(provider);
    setWatches((current) => pruneLandedWatches(current, connections).watches);
  }, [landed]);
  /** Watch `provider` from now; `expiresAt` is the code it minted, if any. */
  const watch = (provider: ChannelProviderId, expiresAt?: string) =>
    setWatches((current) =>
      watchChannel(current, provider, connections, Date.now(), expiresAt),
    );
  return { query, connections, watches, watch };
}
