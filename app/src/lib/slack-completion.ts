import type { SlackCompletionFailure } from "@houston/engine-adapter";
import type { SlackCompletion } from "./settings-landing.ts";

/**
 * Why the Slack connection did not happen, from the two places that can refuse
 * it: the callback link itself, mangled so it could never be redeemed, and the
 * gateway refusing the ticket it minted. Both are one vocabulary here — neither
 * source impersonates the other's wire literal.
 *
 *  - `unredeemable` — this link will never connect anything; connect again.
 *  - `taken`        — the Slack account is bound to another Houston account.
 */
export type SlackCompletionResult = "unredeemable" | "taken";

export function slackCompletionResult(
  landed: SlackCompletion | null,
  refused: SlackCompletionFailure | null,
): SlackCompletionResult | null {
  if (landed?.kind === "invalid" || refused === "invalid")
    return "unredeemable";
  return refused === "already" ? "taken" : null;
}

/**
 * Take the queued completion, at most once. The latch closes over a value that
 * was actually TAKEN, never over the attempt: the Channels body can mount
 * before the landing has queued anything, and a take that found an empty queue
 * must leave the next one free.
 *
 * What stops a second redemption across a remount is the queue itself — the
 * value is cleared in the same pass it is read, and nothing re-queues it — so
 * the gateway is never asked to redeem a spent ticket, which it answers with
 * the same 404 it gives a stranger.
 */
export function takeSlackCompletion(
  latch: { current: boolean },
  read: () => SlackCompletion | null,
  clear: () => void,
): SlackCompletion | null {
  if (latch.current) return null;
  const pending = read();
  if (!pending) return null;
  latch.current = true;
  clear();
  return pending;
}
