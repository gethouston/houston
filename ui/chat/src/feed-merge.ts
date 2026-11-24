import type { FeedItem } from "./types";

/** Options controlling how a single FeedItem merges into the live feed. */
export interface MergeFeedOptions {
  /**
   * The item arrived over the engine WebSocket (a push event), not from an
   * optimistic local push. Used by {@link reconcileUserMessageEcho} to drop the
   * engine's re-broadcast of a prompt this client already pushed optimistically.
   */
  fromWs?: boolean;
}

/**
 * Per-session tally of optimistic (locally-pushed) user messages still awaiting
 * their engine WS echo, keyed by message text.
 */
export type PendingUserEcho = Record<string, number>;

/**
 * Decide whether a `user_message` should be appended to a session feed, given
 * the optimistic pushes still awaiting their WS echo.
 *
 * The engine re-broadcasts every turn's prompt over the `session:{key}` WS topic
 * so other clients echo it. The client that SENT the turn already pushed the
 * prompt optimistically, so that echo is a duplicate — but only for that one
 * turn. The earlier fix (#363) dropped any WS `user_message` whose TEXT already
 * appeared in the feed, which wrongly collapsed DISTINCT turns that share text:
 * once a routine reuses a single chat across runs (#381), every run carries the
 * identical prompt, so a new run's prompt got swallowed by an earlier run's
 * (and prior runs sitting in hydrated history swallowed it too).
 *
 * Correlating echo→optimistic by a pending count fixes both: the sender's own
 * echo is dropped, while a background routine run (which never pushes
 * optimistically) and cross-client deliveries append. Mutates `pending`.
 *
 * @returns `true` to append the item, `false` to drop it as a duplicate echo.
 */
export function reconcileUserMessageEcho(
  pending: PendingUserEcho,
  item: FeedItem,
  fromWs: boolean,
): boolean {
  if (item.feed_type !== "user_message") return true;
  if (!fromWs) {
    pending[item.data] = (pending[item.data] ?? 0) + 1;
    return true;
  }
  const awaiting = pending[item.data] ?? 0;
  if (awaiting > 0) {
    pending[item.data] = awaiting - 1;
    return false;
  }
  return true;
}

/**
 * Smart-merge a new FeedItem into an existing feed array.
 *
 * Handles streaming replacement logic:
 * - `thinking_streaming` replaces previous `thinking_streaming`
 * - `thinking` (final) replaces last `thinking_streaming`
 * - `assistant_text_streaming` replaces previous `assistant_text_streaming`
 * - `assistant_text` (final) replaces last `assistant_text_streaming`
 * - a null-input `tool_call` is replaced by the real-input one
 * - everything else is appended.
 *
 * `user_message` echo de-duplication is handled separately by
 * {@link reconcileUserMessageEcho} BEFORE this is called, because it needs
 * per-session provenance state this pure function does not carry.
 *
 * Use this in your Zustand/Redux store to avoid duplicating merge logic.
 */
export function mergeFeedItem(items: FeedItem[], item: FeedItem): FeedItem[] {
  const last = items[items.length - 1];

  if (item.feed_type === "thinking_streaming") {
    return replaceLast(
      items,
      item,
      (existing) => existing.feed_type === "thinking_streaming",
    );
  }

  if (item.feed_type === "thinking") {
    return replaceLast(
      items,
      item,
      (existing) => existing.feed_type === "thinking_streaming",
    );
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

  if (item.feed_type === "tool_call" && last?.feed_type === "tool_call") {
    if (last.data.name === item.data.name && last.data.input == null) {
      return [...items.slice(0, -1), item];
    }
  }

  return [...items, item];
}

export function mergeFeedHistory(
  history: FeedItem[],
  current: FeedItem[],
): FeedItem[] {
  if (current.length === 0) return history;

  const remaining = new Map<string, number>();
  for (const item of history) {
    const key = feedTurnKey(item);
    remaining.set(key, (remaining.get(key) ?? 0) + 1);
  }

  const merged: FeedItem[] = [];
  let hi = 0;
  let pendingClientOnly: FeedItem[] = [];

  for (const item of current) {
    const key = feedTurnKey(item);
    if ((remaining.get(key) ?? 0) > 0) {
      merged.push(...pendingClientOnly);
      pendingClientOnly = [];
      while (hi < history.length) {
        const h = history[hi++];
        merged.push(h);
        const hk = feedTurnKey(h);
        remaining.set(hk, (remaining.get(hk) ?? 0) - 1);
        if (hk === key) break;
      }
    } else {
      pendingClientOnly.push(item);
    }
  }

  while (hi < history.length) merged.push(history[hi++]);
  merged.push(...pendingClientOnly);

  return merged;
}

function feedTurnKey(item: FeedItem): string {
  const type =
    item.feed_type === "assistant_text_streaming"
      ? "assistant_text"
      : item.feed_type === "thinking_streaming"
        ? "thinking"
        : item.feed_type;
  const data =
    typeof item.data === "string" ? item.data : JSON.stringify(item.data);
  return JSON.stringify([type, data]);
}

function replaceLast(
  items: FeedItem[],
  item: FeedItem,
  predicate: (item: FeedItem) => boolean,
): FeedItem[] {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index])) {
      return [...items.slice(0, index), item, ...items.slice(index + 1)];
    }
  }
  return [...items, item];
}
