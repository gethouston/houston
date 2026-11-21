import type { SlackCompletionFailure } from "@houston/engine-adapter";
import type { SlackCompletion } from "./settings-landing.ts";

export type SlackCompletionResult = "unredeemable" | "taken";

export function slackCompletionResult(
  landed: SlackCompletion | null,
  refused: SlackCompletionFailure | null,
): SlackCompletionResult | null {
  if (landed?.kind === "invalid" || refused === "invalid")
    return "unredeemable";
  return refused === "already" ? "taken" : null;
}

export function takeSlackCompletion(
  read: () => SlackCompletion | null,
  clear: () => void,
): SlackCompletion | null {
  const pending = read();
  if (pending) clear();
  return pending;
}
