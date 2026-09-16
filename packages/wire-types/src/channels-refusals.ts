/**
 * The two refusals a channels call answers with, read off the error the engine
 * adapter throws. Pure readings of a status and a body: nothing here calls a
 * server, so both surfaces and their tests share one vocabulary.
 */

/**
 * The completion route's own refusals, about the TICKET rather than the
 * deployment: unknown, expired, already redeemed or minted for someone else
 * (404), and a Slack account already connected elsewhere (409). A deployment
 * that does not serve the route answers 404 too, and "connect again" is the
 * right thing to say there as well.
 */
export type SlackCompletionFailure = "invalid" | "already";

export function slackCompletionFailure(
  error: unknown,
): SlackCompletionFailure | null {
  if (!error || typeof error !== "object" || !("status" in error)) return null;
  if (error.status === 404) return "invalid";
  return error.status === 409 ? "already" : null;
}

export type ChannelUnavailableReason = "unsupported" | "not-configured";

/** Expected deployment states, including both gateway error envelope shapes. */
export function channelUnavailableReason(
  error: unknown,
): ChannelUnavailableReason | null {
  if (!error || typeof error !== "object" || !("status" in error)) return null;
  if (error.status === 404 || error.status === 501) return "unsupported";
  if (error.status !== 503 || !("body" in error)) return null;
  const body = error.body;
  if (!body || typeof body !== "object") return null;
  const nested = "error" in body ? body.error : null;
  const code =
    "code" in body
      ? body.code
      : nested && typeof nested === "object" && "code" in nested
        ? nested.code
        : nested;
  return code === "not_configured" ? "not-configured" : null;
}
