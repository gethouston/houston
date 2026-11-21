export type SlackCompletionFailure = "invalid" | "already";

export function slackCompletionFailure(
  error: unknown,
): SlackCompletionFailure | null {
  if (!error || typeof error !== "object" || !("status" in error)) return null;
  if (error.status === 404) return "invalid";
  return error.status === 409 ? "already" : null;
}

export type ChannelUnavailableReason = "unsupported" | "not-configured";

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
