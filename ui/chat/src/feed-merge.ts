import type { FeedItem } from "./types";

export interface MergeFeedOptions {
  fromWs?: boolean;
}

export type PendingUserEcho = Record<string, number>;

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
