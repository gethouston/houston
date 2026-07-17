import type { FeedItem } from "@houston-ai/chat";

/**
 * Whether the agent has visibly replied in the mission conversation: its
 * first text (streaming counts — the reply is on screen) or a surfaced turn
 * error. The user's own kickoff message does NOT count.
 */
export function feedShowsAgentReply(feed: readonly FeedItem[]): boolean {
  return feed.some(
    (item) =>
      item.feed_type === "assistant_text" ||
      item.feed_type === "assistant_text_streaming" ||
      item.feed_type === "provider_error" ||
      item.feed_type === "tool_runtime_error",
  );
}

/**
 * Whether to offer the "skip" escape hatch on the final email onboarding step.
 *
 * The step normally auto-advances when the agent emits the
 * `[TUTORIAL_COMPLETED]` marker. The escape appears once the AGENT has replied
 * (not merely once the user's kickoff went out) — or once anything has
 * errored, so a failure never strands the user with retry as the only exit.
 */
export function shouldOfferSkip(args: {
  /** The agent's first reply (or an in-feed error) is on screen. */
  agentReplied: boolean;
  /** The kickoff (or a follow-up send) surfaced an app-level error. */
  hasError: boolean;
  /** The completion marker was seen (the happy path auto-advances instead). */
  setupDone: boolean;
}): boolean {
  return (args.agentReplied || args.hasError) && !args.setupDone;
}
