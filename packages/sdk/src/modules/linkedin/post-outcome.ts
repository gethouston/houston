import { linkedInPostedSchema, linkedInRefusalOf } from "@houston/wire-types";
import type { Clock } from "../../ports";
import type { HttpScope, SdkHttpError } from "../http";
import type { LinkedInPostResult } from "./types";

export const LINKEDIN_POST_BODY_MS = 10_000;

const UNKNOWN: LinkedInPostResult = { kind: "unknown" };

const NEVER_SENT =
  /internet connection appears to be offline|hostname could not be found|could not connect to the server/i;

export function unansweredPost(err: TypeError): LinkedInPostResult {
  return NEVER_SENT.test(err.message)
    ? { kind: "refused", code: "offline" }
    : UNKNOWN;
}

const PROXY_FAILURES = new Set([502, 504]);

export function refusedPost(err: SdkHttpError): LinkedInPostResult | null {
  const code = linkedInRefusalOf(err.status, err.message);
  if (!code) return PROXY_FAILURES.has(err.status) ? UNKNOWN : null;
  return err.retryAfterMs === undefined
    ? { kind: "refused", code }
    : { kind: "refused", code, retryAfterMs: err.retryAfterMs };
}

export async function postedPost(
  scope: HttpScope,
  res: Response,
  cut: () => void,
): Promise<LinkedInPostResult> {
  const body = await within(
    scope.ports.clock,
    res.text().catch(() => ""),
    cut,
  );
  const parsed = linkedInPostedSchema.safeParse(jsonOrNull(body));
  if (parsed.success) return { kind: "posted", ...parsed.data };
  scope.ports.logger.warn("linkedin post went up with no readable id", {
    status: res.status,
  });
  return { kind: "posted", postUrn: null, postUrl: null };
}

function within(
  clock: Clock,
  read: Promise<string>,
  cut: () => void,
): Promise<string> {
  let timer = 0;
  const stalled = new Promise<string>((resolve) => {
    timer = clock.setTimeout(() => {
      cut();
      resolve("");
    }, LINKEDIN_POST_BODY_MS);
  });
  return Promise.race([read, stalled]).finally(() => clock.clearTimeout(timer));
}

function jsonOrNull(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
