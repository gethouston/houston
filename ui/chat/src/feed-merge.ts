import type { FeedItem } from "./types";

/**
 * Smart-merge a new FeedItem into an existing feed array.
 *
 * Handles streaming replacement logic:
 * - `thinking_streaming` replaces previous `thinking_streaming`
 * - `thinking` (final) replaces last `thinking_streaming`
 * - `assistant_text_streaming` replaces previous `assistant_text_streaming`
 * - `assistant_text` (final) replaces last `assistant_text_streaming`
 * - Everything else is appended, unless an exact duplicate already exists
 *   in the current turn (guards against live WS events re-pushing an item
 *   that history hydration already seeded).
 *
 * Pass `opts.fromWs` for items arriving over the engine WebSocket echo (as
 * opposed to a local optimistic push). The engine emits each user message
 * exactly once per turn, so a WS-sourced `user_message` that duplicates one
 * already in the feed is a re-delivery and is dropped — this is what keeps a
 * surfaced routine (whose transcript is both hydrated from history AND replayed
 * live) from showing the user's prompt twice (#363). Optimistic pushes omit the
 * flag and always append, so a user legitimately re-sending the same text keeps
 * both copies.
 *
 * Use this in your Zustand/Redux store to avoid duplicating merge logic.
 */
export function mergeFeedItem(
  items: FeedItem[],
  item: FeedItem,
  opts?: { fromWs?: boolean },
): FeedItem[] {
  const last = items[items.length - 1];

  if (item.feed_type === "thinking_streaming") {
    if (hasEquivalentSinceLastUser(items, item)) return items;
    return (
      replaceLast(
        items,
        item,
        (existing) => existing.feed_type === "thinking_streaming",
      ) ?? [...items, item]
    );
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
    return (
      replaceLast(
        items,
        item,
        (existing) => existing.feed_type === "assistant_text_streaming",
      ) ?? [...items, item]
    );
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

  if (item.feed_type === "user_message") {
    // Collapse consecutive identical user_messages. Desktop's send handler
    // pushes an optimistic user_message the instant the user hits send, and
    // the engine also broadcasts the same text via a WS FeedItem echo that
    // lands right after. Without this, every send would double up.
    if (last?.feed_type === "user_message" && last.data === item.data) {
      return items;
    }
    // Drop a WS-delivered user_message that duplicates one already in the feed
    // even when it is NOT consecutive. A surfaced routine's transcript is
    // hydrated from DB history (mergeFeedHistory) and the same turn is also
    // replayed over the live socket; the echo arrives after the assistant
    // reply, so the consecutive check above misses it and it would otherwise be
    // appended below — surfacing the user's prompt a second time (#363). Local
    // optimistic pushes omit `fromWs` and fall through, so a deliberate repeat
    // of the same text keeps both copies.
    if (
      opts?.fromWs &&
      items.some((it) => it.feed_type === "user_message" && it.data === item.data)
    ) {
      return items;
    }
  }

  // Guard the general append path: a live WS event can repeat an item that
  // history hydration (or an earlier event) already placed in the current
  // turn. Drop the exact duplicate so a routine surfaced to the board does
  // not show its first turn twice. User messages are exempt — a real repeat
  // turn is meaningful and handled by the consecutive-collapse above.
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
