export type SlackConnectReturn =
  | { kind: "app"; port?: never; state?: never }
  | { kind: "loopback"; port: number; state: string };

export type SlackConnectReturnKind = SlackConnectReturn["kind"];

export const SLACK_LOOPBACK_MIN_PORT = 1024;
export const SLACK_LOOPBACK_MAX_PORT = 65535;

export const SLACK_LOOPBACK_STATE = /^[A-Za-z0-9_-]{16,128}$/;
