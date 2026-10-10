/**
 * The browser hand-off a Slack connect starts. Pure: the Channels section
 * renders it. The watch for the connection the hand-off produces is the SDK's
 * (`@houston/sdk/channels/watch`).
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
