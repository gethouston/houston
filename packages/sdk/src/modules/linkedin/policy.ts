import type {
  LinkedInConnection,
  LinkedInRefusalCode,
} from "@houston/wire-types";

export const LINKEDIN_CONNECT_POLL_MS = 2_000;

export const LINKEDIN_CONNECT_WATCH_MS = 10 * 60_000;

export interface LinkedInConnectWatch {
  until: number;
}

export function startLinkedInConnectWatch(now: number): LinkedInConnectWatch {
  return { until: now + LINKEDIN_CONNECT_WATCH_MS };
}

export function linkedInConnectPollMs(
  watch: LinkedInConnectWatch | null,
  connection: LinkedInConnection | undefined,
  now: number,
): number | false {
  if (!watch || connection?.connected === true || now >= watch.until)
    return false;
  return LINKEDIN_CONNECT_POLL_MS;
}

export const LINKEDIN_FEED_URL = "https://www.linkedin.com/feed/";

export function linkedInPostLink(postUrl: string | null): string {
  return postUrl ?? LINKEDIN_FEED_URL;
}

export function linkedInRetryMinutes(
  retryAfterMs: number | undefined,
): number | null {
  if (retryAfterMs === undefined || !(retryAfterMs > 0)) return null;
  return Math.max(1, Math.ceil(retryAfterMs / 60_000));
}

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
