import type { ChannelProviderId } from "./types";

/**
 * The window after a channel hand-off in which the connection it produces can
 * appear. The connection is made on the gateway (a Slack authorization, a
 * WhatsApp message sent from the person's phone), never in the surface that
 * started it, so nothing tells that surface when it lands: it polls the
 * connections list while a watch is outstanding and stops the moment the
 * provider's connection arrives, or when the person is plainly not coming back.
 *
 * A watch belongs to ONE provider and looks only at that provider's
 * connections, so a Slack connection landing never ends a WhatsApp wait, and
 * starting one hand-off never restarts the other's clock. A connection lands
 * when an id appears that the watch did not start with: counting would miss a
 * new connection that arrives after an old one was disconnected.
 *
 * Pure and dependency-free, so a surface holds the {@link ChannelWatches}
 * record as plain state and the rules stay here. Surfaces import it through
 * the `@houston/sdk/channels/watch` subpath.
 */

/**
 * The shortest watch. A code that lives longer (a WhatsApp code, ten minutes)
 * stretches the watch to its expiry: that code is scanned on ANOTHER device, so
 * the window that shows it never regains focus to refetch on its own.
 */
export const CHANNEL_WATCH_MS = 3 * 60_000;

/** How often the connections list is read while a watch is outstanding. */
export const CHANNEL_WATCH_POLL_MS = 5_000;

/** The fields of a connection a watch reads. */
export interface WatchedConnection {
  id: string;
  provider: ChannelProviderId;
}

/** A hand-off in progress: whose, what was already there, and when to stop. */
export interface ChannelWatch {
  provider: ChannelProviderId;
  /** The provider's connection ids when the hand-off started. */
  known: readonly string[];
  /** Epoch ms after which the watch stops polling. */
  until: number;
}

/** The outstanding hand-offs, at most one per provider. */
export type ChannelWatches = Readonly<
  Partial<Record<ChannelProviderId, ChannelWatch>>
>;

/**
 * Start watching for `provider`'s next connection. `expiresAt` is the code the
 * hand-off minted, when it minted one; an unparseable expiry keeps the default.
 */
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

/** A connection of the watched provider it did not start with: landed. */
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

/** Still waiting: nothing has landed and the window is open. */
export function channelWatchActive(
  watch: ChannelWatch | undefined,
  connections: readonly WatchedConnection[],
  now: number,
): boolean {
  if (!watch) return false;
  return !channelWatchLanded(watch, connections) && now < watch.until;
}

/** The list's poll interval: on while any watch is outstanding, else off. */
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

/** The record with `provider`'s watch (re)started; the others untouched. */
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

/**
 * End every watch whose connection landed, and name those providers so the
 * surface can clear what each hand-off left on screen. Nothing landed returns
 * the SAME record, so a surface storing it re-renders for nothing.
 */
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
