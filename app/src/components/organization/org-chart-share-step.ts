import type { LinkedInConnection } from "@houston/wire-types";
import type { ShareRoute } from "./org-chart-share-run.ts";

/**
 * The dialog's one primary button, from where it stands. Pure and DOM-free.
 *
 * - `share`: Share on LinkedIn, `via` the share sheet or copy and paste.
 *   Copy and paste also stands in on the `post` route when the connection
 *   could not be read: the person still gets to LinkedIn.
 * - `checking`: the connection is being read.
 * - `connect`: Connect LinkedIn. `phase` is `idle` (clickable), `minting`
 *   (LinkedIn's page is being asked for) or `waiting` (it is open in another
 *   window and the connection is polled until it lands); the button is busy
 *   in both, and waiting offers to start over.
 * - `post`: Post to LinkedIn, as `name`; `posting` while it goes up.
 * - `posted`: View post, LinkedIn's page for the post just made.
 */
export type ShareStep =
  | { kind: "share"; via: "sheet" | "paste" }
  | { kind: "checking" }
  | { kind: "connect"; phase: ConnectPhase }
  | { kind: "post"; name: string; posting: boolean }
  | { kind: "posted"; postUrl: string };

export type ConnectPhase = "idle" | "minting" | "waiting";

/** The connection read, as a query holds it. */
export type ConnectionRead =
  | { status: "pending" }
  | { status: "error" }
  | { status: "ready"; connection: LinkedInConnection };

/**
 * A query's connection read. Data wins over an error: one failed background
 * refetch keeps the connection the person already has on screen, rather than
 * flipping the button to copy and paste.
 */
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
  /** Where this opening's connect stands. */
  connecting: ConnectPhase;
  posting: boolean;
  /** LinkedIn's page for the post made in this opening. */
  postUrl: string | null;
}): ShareStep {
  const { route, connection } = input;
  if (route === "sheet") return { kind: "share", via: "sheet" };
  if (route === "paste") return { kind: "share", via: "paste" };
  if (input.postUrl) return { kind: "posted", postUrl: input.postUrl };
  if (connection.status === "error") return { kind: "share", via: "paste" };
  if (connection.status === "pending") return { kind: "checking" };
  const { connection: read } = connection;
  if (read.connected)
    return { kind: "post", name: read.name, posting: input.posting };
  return { kind: "connect", phase: input.connecting };
}
