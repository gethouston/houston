/**
 * What a surface does around a LinkedIn connect and post: how long it waits
 * for a connection made in another tab, and what each refusal means for the
 * person. Pure and dependency-free, so a surface holds the watch as plain
 * state and the rules stay here. Surfaces import it through the
 * `@houston/sdk/linkedin/policy` subpath.
 */

import type {
  LinkedInConnection,
  LinkedInRefusalCode,
} from "@houston/wire-types";

/**
 * The connection is made on the gateway's callback, in the tab LinkedIn
 * opened, so nothing tells the surface when it lands: it reads the connection
 * every {@link LINKEDIN_CONNECT_POLL_MS} while a watch is outstanding.
 */
export const LINKEDIN_CONNECT_POLL_MS = 2_000;

/** How long a watch lasts: the gateway's connect state lives ten minutes. */
export const LINKEDIN_CONNECT_WATCH_MS = 10 * 60_000;

/** A connect in progress, and when the person is plainly not coming back. */
export interface LinkedInConnectWatch {
  /** Epoch ms after which the watch stops polling. */
  until: number;
}

export function startLinkedInConnectWatch(now: number): LinkedInConnectWatch {
  return { until: now + LINKEDIN_CONNECT_WATCH_MS };
}

/**
 * The connection read's next poll, in ms, or `false` to stop: no watch, the
 * connection landed, or the window closed. The surface drops the watch when
 * it closes (the dialog shut), which stops the poll too.
 */
export function linkedInConnectPollMs(
  watch: LinkedInConnectWatch | null,
  connection: LinkedInConnection | undefined,
  now: number,
): number | false {
  if (!watch || connection?.connected === true || now >= watch.until)
    return false;
  return LINKEDIN_CONNECT_POLL_MS;
}

/** LinkedIn's own feed: a post that went up with no readable link tops it. */
export const LINKEDIN_FEED_URL = "https://www.linkedin.com/feed/";

/** Where View post goes: the post's own page, or the person's feed. */
export function linkedInPostLink(postUrl: string | null): string {
  return postUrl ?? LINKEDIN_FEED_URL;
}

/**
 * A rate limit's wait in whole minutes, rounded up so the person never comes
 * back early, or `null` when the gateway did not say.
 */
export function linkedInRetryMinutes(
  retryAfterMs: number | undefined,
): number | null {
  if (retryAfterMs === undefined || !(retryAfterMs > 0)) return null;
  return Math.max(1, Math.ceil(retryAfterMs / 60_000));
}

/**
 * What a refused post means for the person:
 *  - `reconnect`: the connection is gone; connect again, then post.
 *  - `wait`: too many posts for now; try later.
 *  - `retry`: LinkedIn failed; trying again may work.
 *  - `offline`: no connection to the network.
 *  - `fallback`: this deployment cannot post; share by copy and paste.
 *  - `quiet`: the Houston session lapsed, which signs the person out itself.
 *  - `report`: the gateway refused what this client sent, a bug: nothing to
 *    say, everything to report.
 */
export type LinkedInRefusalAction =
  | "reconnect"
  | "wait"
  | "retry"
  | "offline"
  | "fallback"
  | "quiet"
  | "report";

export function linkedInRefusalAction(
  code: LinkedInRefusalCode,
): LinkedInRefusalAction {
  switch (code) {
    case "linkedin_not_connected":
      return "reconnect";
    case "rate_limited":
      return "wait";
    case "linkedin_failed":
      return "retry";
    case "offline":
      return "offline";
    case "not_configured":
      return "fallback";
    case "signed_out":
      return "quiet";
    default:
      return "report";
  }
}

/** A refusal that is a state of LinkedIn, the network or the deployment. */
export function isExpectedLinkedInRefusal(code: LinkedInRefusalCode): boolean {
  return linkedInRefusalAction(code) !== "report";
}

function bodyCode(body: unknown): unknown {
  if (typeof body === "string") {
    try {
      return bodyCode(JSON.parse(body));
    } catch {
      return null;
    }
  }
  if (!body || typeof body !== "object") return null;
  const { code, error } = body as { code?: unknown; error?: unknown };
  return code ?? error;
}

/**
 * Whether a failed connection read or connect is the deployment having no
 * LinkedIn (a 503 `not_configured`, or a route it does not serve): expected,
 * and the surface shares by copy and paste instead. Reads the error's
 * `status` and its `body` (parsed or raw) or, failing that, its message.
 */
export function isLinkedInUnavailableError(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("status" in error)) return false;
  const { status } = error;
  if (status === 404 || status === 405 || status === 501) return true;
  if (status !== 503) return false;
  const body =
    "body" in error
      ? error.body
      : error instanceof Error
        ? error.message
        : null;
  return bodyCode(body) === "not_configured";
}
