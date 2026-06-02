import type { FeedItem } from "./types";

/** Options controlling how a single FeedItem merges into the live feed. */
export interface MergeFeedOptions {
  /**
   * The item arrived over the engine WebSocket (a push event), not from an
   * optimistic local push. The engine re-broadcasts a turn's `user_message`
   * over the `session:{key}` topic (so other clients echo it) AFTER streaming
   * has begun, so that echo can land non-consecutively: on top of the
   * assistant reply or on top of hydrated history. A WS-sourced `user_message`
   * the feed already shows is a re-delivery and is dropped; optimistic/local
   * pushes leave this unset so a deliberate repeat of the same text always
   * appends.
   */
  fromWs?: boolean;
}

/**
 * Smart-merge a new FeedItem into an existing feed array.
 *
 * Handles streaming replacement logic:
 * - `thinking_streaming` replaces previous `thinking_streaming`
 * - `thinking` (final) replaces last `thinking_streaming`
 * - `assistant_text_streaming` replaces previous `assistant_text_streaming`
 * - `assistant_text` (final) replaces last `assistant_text_streaming`
 * - a WebSocket-echoed `user_message` already present is dropped
 * - everything else is appended.
 *
 * Use this in your Zustand/Redux store to avoid duplicating merge logic.
 */
export function mergeFeedItem(
  items: FeedItem[],
  item: FeedItem,
  opts?: MergeFeedOptions,
): FeedItem[] {
  const last = items[items.length - 1];

  if (item.feed_type === "thinking_streaming") {
    return replaceLast(items, item, (existing) => existing.feed_type === "thinking_streaming");
  }

  if (item.feed_type === "thinking") {
    return replaceLast(items, item, (existing) => existing.feed_type === "thinking_streaming");
  }

  if (item.feed_type === "assistant_text_streaming") {
    return replaceLast(
      items,
      item,
      (existing) => existing.feed_type === "assistant_text_streaming",
    );
  }

  if (item.feed_type === "assistant_text") {
    return replaceLast(
      items,
      item,
      (existing) => existing.feed_type === "assistant_text_streaming",
    );
  }

  // tool_call with real input replaces the immediate null-input notification
  // (the Rust parser emits two tool_calls per tool: one on content_block_start
  // with null input, one on content_block_stop with the real input)
  if (item.feed_type === "tool_call" && last?.feed_type === "tool_call") {
    if (last.data.name === item.data.name && last.data.input == null) {
      return [...items.slice(0, -1), item];
    }
  }

  // Drop a WebSocket-echoed user_message the feed already shows. The engine
  // re-broadcasts the turn's prompt over the session topic for cross-client
  // echo AFTER streaming has begun, so the echo can arrive non-consecutively:
  // on top of the assistant reply, or on top of hydrated history. Matching only
  // the immediately-previous item (the old behaviour) let routine-surfaced
  // turns render their first user prompt twice (issue #363). Provenance, not
  // shape, decides: only WS deliveries dedupe, so a user who deliberately
  // repeats the same text locally still sees both copies.
  if (item.feed_type === "user_message" && opts?.fromWs) {
    if (items.some((it) => it.feed_type === "user_message" && it.data === item.data)) {
      return items;
    }
  }

  return [...items, item];
}

/**
 * Reconcile a freshly-loaded server `history` slice with whatever already sits
 * in the live feed bucket (`current`) for the same session: optimistic pushes
 * plus WS events that landed before or during the history fetch.
 *
 * Server history is authoritative for everything persisted up to load time, so
 * it is returned verbatim and only the `current` items it does NOT already
 * account for are appended after it. The match is by TURN IDENTITY, not by
 * byte-exact JSON: a live `assistant_text_streaming` (or `thinking_streaming`)
 * is the same turn as the persisted `assistant_text` (`thinking`) final and
 * must not re-append. That byte-exact mismatch was the bug behind issue #363,
 * where a routine-surfaced conversation rendered its first user prompt and AI
 * reply twice. Matching is count-based (a turn persisted once cancels exactly
 * one live copy) so a user who legitimately repeated a message keeps every
 * copy, and runs in O(history + current) via a Map rather than re-stringifying
 * on every compare.
 */
export function mergeFeedHistory(
  history: FeedItem[],
  current: FeedItem[],
): FeedItem[] {
  if (current.length === 0) return history;

  const persisted = new Map<string, number>();
  for (const item of history) {
    const key = feedTurnKey(item);
    persisted.set(key, (persisted.get(key) ?? 0) + 1);
  }

  const tail: FeedItem[] = [];
  for (const item of current) {
    const key = feedTurnKey(item);
    const remaining = persisted.get(key) ?? 0;
    if (remaining > 0) {
      // Already represented by a persisted item: consume one and skip.
      persisted.set(key, remaining - 1);
    } else {
      tail.push(item);
    }
  }

  return tail.length === 0 ? history : [...history, ...tail];
}

/**
 * Identity of a feed turn for history reconciliation. Streaming and final
 * variants of the same turn collapse to one key so a not-yet-finalized live
 * stream matches its persisted final; `data` is folded in (stringified for
 * object payloads) so distinct turns of the same type stay distinct. The key
 * is a JSON tuple so there is no separator that could collide with content.
 */
function feedTurnKey(item: FeedItem): string {
  const type =
    item.feed_type === "assistant_text_streaming"
      ? "assistant_text"
      : item.feed_type === "thinking_streaming"
        ? "thinking"
        : item.feed_type;
  const data = typeof item.data === "string" ? item.data : JSON.stringify(item.data);
  return JSON.stringify([type, data]);
}

function replaceLast(
  items: FeedItem[],
  item: FeedItem,
  predicate: (item: FeedItem) => boolean,
): FeedItem[] {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index])) {
      return [
        ...items.slice(0, index),
        item,
        ...items.slice(index + 1),
      ];
    }
  }
  return [...items, item];
}
