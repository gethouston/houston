import type { FeedItem } from "@houston-ai/chat";

/**
 * Whether the mission conversation has surfaced a turn failure: a provider
 * error in the feed. Normal agent replies do NOT count — the happy path
 * auto-advances and needs no escape hatch.
 */
export function feedShowsTurnError(feed: readonly FeedItem[]): boolean {
  return feed.some((item) => item.feed_type === "provider_error");
}
