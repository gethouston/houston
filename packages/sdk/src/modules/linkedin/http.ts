/**
 * The LinkedIn REST calls, over the injected `fetch`. Hosted-gateway routes:
 * the gateway holds the LinkedIn app key and the person's token, so no host
 * serves them. Literal paths keep them visible to the assistant's catalog.
 */

import {
  type LinkedInConnection,
  type LinkedInConnectReturn,
  linkedInConnectionSchema,
  linkedInConnectSchema,
} from "@houston/wire-types";
import { fetchWithoutAuthReplay } from "../../auth-replay";
import { isTransportFailure } from "../../transport-failure";
import { gatewayRefusedLoopback } from "../channels/connect-return";
import { type HttpScope, httpRequest, SdkHttpError } from "../http";
import { withPostDeadline } from "./post-deadline";
import { postedPost, refusedPost, unansweredPost } from "./post-outcome";
import type {
  LinkedInCompletion,
  LinkedInConnectAnswer,
  LinkedInPostResult,
} from "./types";

/**
 * Shows whether the person's LinkedIn is connected for posting, and as whom.
 *
 * Answers `{connected: true, name, expiresAt}` or `{connected: false}`; a
 * connection past its expiry reads as not connected. Throws on a deployment
 * that cannot post to LinkedIn (503 `not_configured`, or 404 where the route
 * is not served).
 * @assistant group:org
 * @assistant hidden: the gateway serves the LinkedIn routes to the person's own sign-in only; the AI Manager's credential is outside their scope.
 */
export async function getLinkedInConnection(
  scope: HttpScope,
  signal?: AbortSignal,
): Promise<LinkedInConnection> {
  const res = await httpRequest(scope, "/v1/linkedin/connection", { signal });
  return linkedInConnectionSchema.parse(await res.json());
}

/**
 * Starts connecting the person's LinkedIn so Houston can post for them.
 *
 * Answers LinkedIn's own authorization page, which the person's browser
 * opens. Nothing is connected until the browser comes back with a one-time
 * ticket and completeLinkedIn redeems it for the signed-in person.
 * @param returnTo Omit it to return to the web app. `app` returns through the
 *   `houston://` deep link; `loopback` redirects to the desktop shell's
 *   listener on `127.0.0.1:<port>`, which waits for `state`. When the gateway
 *   refuses `loopback`, the connect asks once more for `app`; `accepted` says
 *   which return the page leads back to.
 * @assistant group:org
 * @assistant hidden: answers an authorization URL only the person's own browser may open, and whoever approves it in LinkedIn is whose account Houston would post as.
 */
export async function connectLinkedIn(
  scope: HttpScope,
  returnTo?: LinkedInConnectReturn,
  signal?: AbortSignal,
): Promise<LinkedInConnectAnswer> {
  let res: Response;
  try {
    res = await httpRequest(scope, "/v1/linkedin/connect", {
      method: "POST",
      // Absent fields drop out: a web connect sends `{}`.
      body: JSON.stringify({
        return: returnTo?.kind,
        port: returnTo?.port,
        state: returnTo?.state,
      }),
      signal,
    });
  } catch (error) {
    if (!gatewayRefusedLoopback(returnTo, error, signal)) throw error;
    // Exactly once: the retry names `app`, which never matches again.
    return connectLinkedIn(scope, { kind: "app" }, signal);
  }
  const { authorizeUrl } = linkedInConnectSchema.parse(await res.json());
  return { url: authorizeUrl, accepted: returnTo?.kind ?? null };
}

/**
 * Finishes a LinkedIn connection the person just approved in their browser.
 *
 * The callback proves only that SOMEONE approved in LinkedIn, so the gateway
 * hands the browser a ticket and binds nothing until this authenticated call
 * redeems it. Single use: an unknown, expired, spent or foreign ticket answers
 * `invalid`.
 * @param ticket The one-time ticket the LinkedIn callback returned with.
 * @assistant group:org
 * @assistant hidden: redeems a one-time bearer ticket that only the browser returning from LinkedIn holds, and passing one through a chat turn is how it leaks.
 */
export async function completeLinkedIn(
  scope: HttpScope,
  ticket: string,
  signal?: AbortSignal,
): Promise<LinkedInCompletion> {
  let res: Response;
  try {
    res = await httpRequest(scope, "/v1/linkedin/connect/complete", {
      method: "POST",
      body: JSON.stringify({ ticket }),
      signal,
    });
  } catch (error) {
    if (error instanceof SdkHttpError && error.status === 404)
      return { kind: "invalid" };
    throw error;
  }
  const connection = linkedInConnectionSchema.parse(await res.json());
  return connection.connected
    ? { kind: "connected", connection }
    : { kind: "invalid" };
}

/**
 * Disconnects the person's LinkedIn: Houston forgets the token and can no
 * longer post for them until they connect again.
 * @assistant group:org
 * @assistant hidden: the gateway serves the LinkedIn routes to the person's own sign-in only; the AI Manager's credential is outside their scope.
 */
export async function disconnectLinkedIn(
  scope: HttpScope,
  signal?: AbortSignal,
): Promise<void> {
  await httpRequest(scope, "/v1/linkedin/connection", {
    method: "DELETE",
    signal,
  });
}

/**
 * Posts a picture with words to the person's own LinkedIn feed, public.
 *
 * Every answer that is not a post comes back as a typed refusal (not
 * connected, a rate limit, LinkedIn failing, a deployment with no LinkedIn
 * key, no connection to the network, a picture or words the gateway will not
 * take), never a throw. Any 2xx is a post, its link `null` when the gateway
 * could not name it or its body stalled. A post that may be up is `unknown`,
 * never a refusal: a connection cut after the request left, or a bare 502 or
 * 504 from a proxy in front of the gateway. Only an answer that is none of
 * these throws, and so does an abort through `signal` before any answer. No
 * answer within three minutes is `unknown` too ({@link withPostDeadline}).
 * The post never goes out under another person: a 401 is replayed once only
 * when the refreshed bearer names the same person (a token that went stale
 * while the device slept), and is otherwise a `signed_out` refusal.
 * @param upload Multipart: `image` (a PNG or JPEG of at most 5 MiB, no taller
 *   than 4:5 and no wider than 3:1), `text` (1 to 3000 characters once
 *   trimmed) and an optional `altText`. The route reads its body off this
 *   parameter, so the facade builds it.
 * @assistant group:org hidden: the share dialog draws the picture on the person's device and the person must press Post on words they can see and edit; the assistant has no picture to send.
 * @assistant unschematized: the picture is binary multipart, which no JSON schema describes.
 */
export function postLinkedInImage(
  scope: HttpScope,
  upload: FormData,
  signal?: AbortSignal,
): Promise<LinkedInPostResult> {
  // A 401 is the gateway refusing the bearer before it posted anything.
  const once = {
    ...scope,
    ports: { ...scope.ports, fetch: fetchWithoutAuthReplay(scope.ports.fetch) },
  };
  return withPostDeadline(scope.ports.clock, signal, async (wait, answered) => {
    // Its own controller, so a stalled body can be cut once the deadline
    // stopped at the answer.
    const request = new AbortController();
    const follow = () => request.abort(wait.reason);
    if (wait.aborted) follow();
    else wait.addEventListener("abort", follow, { once: true });
    let res: Response;
    try {
      res = await httpRequest(once, "/v1/linkedin/posts", {
        method: "POST",
        body: upload,
        signal: request.signal,
      });
    } catch (err) {
      if (wait.aborted) throw err;
      if (isTransportFailure(err)) return unansweredPost(err);
      if (!(err instanceof SdkHttpError)) throw err;
      const refused = refusedPost(err);
      if (!refused) throw err;
      return refused;
    }
    answered();
    return postedPost(scope, res, () => request.abort());
  });
}
