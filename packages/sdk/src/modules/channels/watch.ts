import type { ChannelProviderId } from "./types";

export const CHANNEL_WATCH_MS = 3 * 60_000;

export const CHANNEL_WATCH_POLL_MS = 5_000;

export interface WatchedConnection {
  id: string;
  provider: ChannelProviderId;
}

export interface ChannelWatch {
  provider: ChannelProviderId;
  known: readonly string[];
  until: number;
}

export type ChannelWatches = Readonly<
  Partial<Record<ChannelProviderId, ChannelWatch>>
>;

export function startChannelWatch(
  provider: ChannelProviderId,
  connections: readonly WatchedConnection[],
  now: number,
  expiresAt?: string,
): ChannelWatch {
  const expiry = expiresAt === undefined ? Number.NaN : Date.parse(expiresAt);
  const until = Number.isFinite(expiry)
    ? Math.max(now + CHANNEL_WATCH_MS, expiry)
    : now + CHANNEL_WATCH_MS;
  const known = connections
    .filter((item) => item.provider === provider)
    .map((item) => item.id);
  return { provider, known, until };
}

export function channelWatchLanded(
  watch: ChannelWatch | undefined,
  connections: readonly WatchedConnection[],
): boolean {
  if (!watch) return false;
  return connections.some(
    (item) =>
      item.provider === watch.provider && !watch.known.includes(item.id),
  );
}

export function channelWatchActive(
  watch: ChannelWatch | undefined,
  connections: readonly WatchedConnection[],
  now: number,
): boolean {
  if (!watch) return false;
  return !channelWatchLanded(watch, connections) && now < watch.until;
}

export function channelWatchPollMs(
  watches: ChannelWatches,
  connections: readonly WatchedConnection[],
  now: number,
): number | false {
  return Object.values(watches).some((watch) =>
    channelWatchActive(watch, connections, now),
  )
    ? CHANNEL_WATCH_POLL_MS
    : false;
}

export function watchChannel(
  watches: ChannelWatches,
  provider: ChannelProviderId,
  connections: readonly WatchedConnection[],
  now: number,
  expiresAt?: string,
): ChannelWatches {
  return {
    ...watches,
    [provider]: startChannelWatch(provider, connections, now, expiresAt),
  };
}

export function pruneLandedWatches(
  watches: ChannelWatches,
  connections: readonly WatchedConnection[],
): { watches: ChannelWatches; landed: ChannelProviderId[] } {
  const landed = Object.values(watches)
    .filter((watch): watch is ChannelWatch =>
      channelWatchLanded(watch, connections),
    )
    .map((watch) => watch.provider);
  if (landed.length === 0) return { watches, landed };
  const next: Partial<Record<ChannelProviderId, ChannelWatch>> = {
    ...watches,
  };
  for (const provider of landed) delete next[provider];
  return { watches: next, landed };
}
