/**
 * The browser hand-off a Slack connect starts, and the window afterwards in
 * which the connection it produces can appear. Both are pure: the Channels
 * section renders them, and the channels query polls on them.
 */

/** What a connect minted: the page to open, and whether the browser opened it. */
export interface SlackAuthorization {
  url: string;
  opened: boolean;
}

/**
 * Where the hand-off stands. `blocked` is the browser REFUSING to open the
 * page (a popup blocker on web, `os-bridge.ts` `osOpenUrl`): saying "finish in
 * Slack" there is the lie the user catches when no tab appeared, so the section
 * names the block and offers the page behind a click the blocker honors.
 */
export type SlackHandoff =
  | { kind: "idle" }
  | { kind: "open" }
  | { kind: "blocked"; url: string };

export function slackHandoff(
  authorization: SlackAuthorization | undefined,
  reopened: boolean | undefined,
): SlackHandoff {
  if (!authorization) return { kind: "idle" };
  if (authorization.opened || reopened) return { kind: "open" };
  return { kind: "blocked", url: authorization.url };
}

/**
 * How long the connections list is watched after a hand-off. The connection is
 * made on the gateway, not in this tab, so nothing here is told when it lands -
 * but a person who walked away must not leave a tab polling forever, and the
 * section's Refresh picks the watch back up.
 */
export const CHANNEL_WATCH_MS = 3 * 60_000;

/** A hand-off in progress: the list as it was, and when to stop waiting. */
export interface ChannelWatch {
  connections: number;
  until: number;
}

export function startChannelWatch(
  connections: number,
  now: number,
): ChannelWatch {
  return { connections, until: now + CHANNEL_WATCH_MS };
}

/** A new connection in the list is the hand-off landing, and ends the watch. */
export function channelWatchActive(
  watch: ChannelWatch | null,
  connections: number,
  now: number,
): boolean {
  if (!watch) return false;
  return connections <= watch.connections && now < watch.until;
}
