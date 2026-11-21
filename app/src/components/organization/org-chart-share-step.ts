import type { LinkedInConnection } from "@houston/wire-types";
import type { ShareRoute } from "./org-chart-share-run.ts";

export type ShareStep =
  | { kind: "share"; via: "sheet" | "paste" }
  | { kind: "checking" }
  | { kind: "connect"; phase: ConnectPhase }
  | { kind: "post"; name: string; posting: boolean }
  | ({ kind: "posted" } & PostedPost);

export interface PostedPost {
  postUrl: string;
  opened: boolean;
}

export type ConnectPhase = "idle" | "minting" | "waiting";

export type ConnectionRead =
  | { status: "pending" }
  | { status: "error" }
  | { status: "ready"; connection: LinkedInConnection };

export function connectionRead(query: {
  data: LinkedInConnection | undefined;
  isError: boolean;
}): ConnectionRead {
  if (query.data) return { status: "ready", connection: query.data };
  return query.isError ? { status: "error" } : { status: "pending" };
}

export function shareStep(input: {
  route: ShareRoute["kind"];
  connection: ConnectionRead;
  connecting: ConnectPhase;
  posting: boolean;
  posted: PostedPost | null;
}): ShareStep {
  const { route, connection } = input;
  if (route === "sheet") return { kind: "share", via: "sheet" };
  if (route === "paste") return { kind: "share", via: "paste" };
  if (input.posted) return { kind: "posted", ...input.posted };
  if (connection.status === "error") return { kind: "share", via: "paste" };
  if (connection.status === "pending") return { kind: "checking" };
  const { connection: read } = connection;
  if (read.connected)
    return { kind: "post", name: read.name, posting: input.posting };
  return { kind: "connect", phase: input.connecting };
}

export type PrimaryVariant = "default" | "outline";

const PRIMARY_VARIANT = {
  share: "default",
  checking: "default",
  connect: "outline",
  post: "default",
  posted: { opened: "outline", closed: "default" },
} as const;

export function primaryVariant(step: ShareStep): PrimaryVariant {
  if (step.kind !== "posted") return PRIMARY_VARIANT[step.kind];
  return PRIMARY_VARIANT.posted[step.opened ? "opened" : "closed"];
}

const POSTS_THROUGH_API = {
  share: false,
  checking: true,
  connect: true,
  post: true,
  posted: true,
} as const satisfies Record<ShareStep["kind"], boolean>;

export const postsThroughApi = (step: ShareStep): boolean =>
  POSTS_THROUGH_API[step.kind];
