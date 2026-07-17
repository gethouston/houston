import type { FeedItem } from "@houston-ai/chat";

/**
 * Whether the mission conversation has surfaced a turn failure: a provider
 * error or a tool runtime error in the feed. Normal agent replies do NOT
 * count — the happy path auto-advances and needs no escape hatch.
 */
export function feedShowsTurnError(feed: readonly FeedItem[]): boolean {
  return feed.some(
    (item) =>
      item.feed_type === "provider_error" ||
      item.feed_type === "tool_runtime_error",
  );
}

/**
 * Whether to offer the "skip" escape hatch on the final email onboarding step.
 *
 * The step normally auto-advances when the agent emits the
 * `[TUTORIAL_COMPLETED]` marker, so mid-conversation there is nothing to skip.
 * The escape appears ONLY when something failed — a kickoff error or an
 * in-feed turn error — so a failure never strands the user with retry as the
 * only exit.
 */
export function shouldOfferSkip(args: {
  /** The kickoff, a follow-up send, or the turn itself surfaced an error. */
  hasError: boolean;
  /** The completion marker was seen (the happy path auto-advances instead). */
  setupDone: boolean;
}): boolean {
  return args.hasError && !args.setupDone;
}
