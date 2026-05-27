import type { FeedItem } from "./types";

/**
 * Smart-merge a new FeedItem into an existing feed array.
 *
 * Handles streaming replacement logic:
 * - `thinking_streaming` replaces previous `thinking_streaming`
 * - `thinking` (final) replaces last `thinking_streaming`
 * - `assistant_text_streaming` replaces previous `assistant_text_streaming`
 * - `assistant_text` (final) replaces last `assistant_text_streaming`
 * - Everything else is appended.
 *
 * Use this in your Zustand/Redux store to avoid duplicating merge logic.
 */
export function mergeFeedItem(items: FeedItem[], item: FeedItem): FeedItem[] {
  const last = items[items.length - 1];

  if (item.feed_type === "thinking_streaming") {
    if (hasEquivalentSinceLastUser(items, item)) return items;
    return replaceLast(
      items,
      item,
      (existing) => existing.feed_type === "thinking_streaming",
    ) ?? [...items, item];
  }

  if (item.feed_type === "thinking") {
    const next = replaceLast(
      items,
      item,
      (existing) => existing.feed_type === "thinking_streaming",
    );
    if (next) return next;
    if (hasEquivalentSinceLastUser(items, item)) return items;
    return [...items, item];
  }

  if (item.feed_type === "assistant_text_streaming") {
    if (hasEquivalentSinceLastUser(items, item)) return items;
    return replaceLast(
      items,
      item,
      (existing) => existing.feed_type === "assistant_text_streaming",
    ) ?? [...items, item];
  }

  if (item.feed_type === "assistant_text") {
    const next = replaceLast(
      items,
      item,
      (existing) => existing.feed_type === "assistant_text_streaming",
    );
    if (next) return next;
    if (hasEquivalentSinceLastUser(items, item)) return items;
    return [...items, item];
  }

  // tool_call with real input replaces the immediate null-input notification
  // (the Rust parser emits two tool_calls per tool: one on content_block_start
  // with null input, one on content_block_stop with the real input)
  if (item.feed_type === "tool_call" && last?.feed_type === "tool_call") {
    if (last.data.name === item.data.name && last.data.input == null) {
      return [...items.slice(0, -1), item];
    }
  }

  // Collapse consecutive identical user_messages. Desktop's send handler
  // pushes an optimistic user_message the instant the user hits send, and
  // the engine also persists + broadcasts the same text via a FeedItem
  // event. Without this, every send from the desktop UI doubles up. The
  // edge case — a user legitimately sending the same text twice back-to-
  // back with no agent response between — is rare and visually harmless
  // (the second appears after the agent replies).
  if (item.feed_type === "user_message" && last?.feed_type === "user_message") {
    if (last.data === item.data) {
      return items;
    }
  }

  if (item.feed_type !== "user_message" && hasExactSinceLastUser(items, item)) {
    return items;
  }

  return [...items, item];
}

/**
 * Merge persisted history with the current in-memory feed.
 *
 * History is authoritative, but the current feed can hold optimistic user
 * messages or live WS events that arrived while history was loading. Treat
 * streaming/final assistant pairs with the same text as duplicates so a stale
 * in-memory stream cannot render below its persisted final answer.
 */
export function mergeFeedHistory(history: FeedItem[], current: FeedItem[]): FeedItem[] {
  const exactCounts = countBy(history, feedItemKey);
  const finalCounts = countBy(history, finalEquivalentKey);
  let merged = [...history];

  for (const item of current) {
    if (consumeCount(exactCounts, feedItemKey(item))) continue;
    if (consumeCount(finalCounts, finalEquivalentKey(item))) continue;
    merged = mergeFeedItem(merged, item);
  }

  return merged;
}

function replaceLast(
  items: FeedItem[],
  item: FeedItem,
  predicate: (item: FeedItem) => boolean,
): FeedItem[] | null {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index])) {
      return [
        ...items.slice(0, index),
        item,
        ...items.slice(index + 1),
      ];
    }
  }
  return null;
}

function hasExactSinceLastUser(items: FeedItem[], item: FeedItem): boolean {
  const key = feedItemKey(item);
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const existing = items[index];
    if (existing.feed_type === "user_message") return false;
    if (feedItemKey(existing) === key) return true;
  }
  return false;
}

function hasEquivalentSinceLastUser(items: FeedItem[], item: FeedItem): boolean {
  const key = finalEquivalentKey(item);
  if (!key) return false;
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const existing = items[index];
    if (existing.feed_type === "user_message") return false;
    if (finalEquivalentKey(existing) === key) return true;
  }
  return false;
}

function feedItemKey(item: FeedItem): string {
  return JSON.stringify(item);
}

function finalEquivalentKey(item: FeedItem): string | null {
  switch (item.feed_type) {
    case "assistant_text":
    case "assistant_text_streaming":
      return `assistant:${item.data}`;
    case "thinking":
    case "thinking_streaming":
      return `thinking:${item.data}`;
    default:
      return null;
  }
}

function countBy(
  items: FeedItem[],
  keyFor: (item: FeedItem) => string | null,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = keyFor(item);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function consumeCount(counts: Map<string, number>, key: string | null): boolean {
  if (!key) return false;
  const count = counts.get(key) ?? 0;
  if (count <= 0) return false;
  if (count === 1) counts.delete(key);
  else counts.set(key, count - 1);
  return true;
}
