import { linkedInPostedSchema, linkedInRefusalOf } from "@houston/wire-types";
import type { Clock } from "../../ports";
import type { HttpScope, SdkHttpError } from "../http";
import type { LinkedInPostResult } from "./types";

/**
 * What a post's answer, or the lack of one, says about LinkedIn. The rule is
 * that a post which may be up is never reported as not posted: the person
 * would press Post again and publish it twice. So only an answer proving the
 * post did not go up is a refusal, and anything in between is `unknown`.
 */

/**
 * How long the body of a 2xx may take. The headers already say the post is
 * up, so a body that stalls only costs its link.
 */
export const LINKEDIN_POST_BODY_MS = 10_000;

const UNKNOWN: LinkedInPostResult = { kind: "unknown" };

/**
 * The transport messages that prove no connection was ever made (WebKit's
 * CFNetwork phrasings). Every other transport failure, Chromium's and
 * Firefox's single message included, may have cut a request the gateway
 * already took.
 */
const NEVER_SENT =
  /internet connection appears to be offline|hostname could not be found|could not connect to the server/i;

/** A post that got no HTTP answer at all. */
export function unansweredPost(err: TypeError): LinkedInPostResult {
  return NEVER_SENT.test(err.message)
    ? { kind: "refused", code: "offline" }
    : UNKNOWN;
}

/**
 * Statuses a proxy in front of the gateway answers with, on its own, while
 * the gateway may still be posting. The gateway's own LinkedIn failure says
 * so with the `linkedin_failed` code and stays a refusal.
 */
const PROXY_FAILURES = new Set([502, 504]);

/** A post answered with an error, or `null` for one that is a failure. */
export function refusedPost(err: SdkHttpError): LinkedInPostResult | null {
  const code = linkedInRefusalOf(err.status, err.message);
  if (!code) return PROXY_FAILURES.has(err.status) ? UNKNOWN : null;
  return err.retryAfterMs === undefined
    ? { kind: "refused", code }
    : { kind: "refused", code, retryAfterMs: err.retryAfterMs };
}

/**
 * A 2xx: a published post, whatever its body does. The gateway answers
 * `201 {}` when LinkedIn gave no readable id, and a body that fails or
 * stalls past {@link LINKEDIN_POST_BODY_MS} (then cut through `cut`) reads
 * as that.
 */
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

/** `read`, or `""` once {@link LINKEDIN_POST_BODY_MS} pass (after `cut`). */
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

/** A body that is not JSON reads as none. */
function jsonOrNull(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
