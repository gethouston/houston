import type { ProviderError } from "@houston/runtime-client";
import type { StallReason } from "./stall-watchdog";

/** What the watchdog saw, for the log line and the card's message. */
export function describeStall(reason: StallReason, windowMs: number): string {
  const seconds = Math.round(windowMs / 1000);
  switch (reason) {
    case "silent":
      return `no provider event for ${seconds}s`;
    case "unanswered":
      return `the provider did not start answering within ${seconds}s, retries included`;
    case "degenerate":
      return "the reply turned into a repetition loop";
  }
}

/**
 * The typed card a turn the watchdog ended settles on. A silent or
 * unanswered request is `provider_internal`: it reached the provider, which
 * then failed to deliver, a provider-side fault with no HTTP status. A loop is
 * `malformed_response`: the model's own output broke, and a retry usually
 * comes back clean.
 */
export function stallFailure(
  reason: StallReason,
  windowMs: number,
  provider: string,
): ProviderError {
  if (reason === "degenerate")
    return {
      kind: "malformed_response",
      provider,
      message:
        "The AI model's reply turned into a repeating loop and was stopped. Please try again.",
    };
  const seconds = Math.round(windowMs / 1000);
  return {
    kind: "provider_internal",
    provider,
    http_status: null,
    message:
      reason === "unanswered"
        ? `The AI provider did not start answering (no response for ${seconds}s). Please try again.`
        : `The AI provider stopped responding (no response for ${seconds}s). Please try again.`,
  };
}
