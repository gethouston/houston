export interface SlackAuthorization {
  url: string;
  opened: boolean;
}

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
