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
    // Optimistic local push: remember it so its echo can be matched + dropped.
    pending[item.data] = (pending[item.data] ?? 0) + 1;
    return true;
  }
  const awaiting = pending[item.data] ?? 0;
  if (awaiting > 0) {
    pending[item.data] = awaiting - 1;
    return false;
  }
  // No optimistic push is waiting: a routine run's prompt, or a turn from
  // another client. Append it — there is nothing to dedupe against.
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

  // tool_call with real input replaces the immediate null-input notification
  // (the Rust parser emits two tool_calls per tool: one on content_block_start
  // with null input, one on content_block_stop with the real input)
  if (item.feed_type === "tool_call" && last?.feed_type === "tool_call") {
    if (last.data.name === item.data.name && last.data.input == null) {
      return [...items.slice(0, -1), item];
    }
  }

  return [...items, item];
}

/**
 * Reconcile a freshly-loaded server `history` slice with whatever already sits
 * in the live feed bucket (`current`) for the same session: optimistic pushes
 * plus WS events that landed before or during the history fetch.
 *
 * Server history is authoritative for everything it persisted, so persisted
 * turns are taken from `history` in `history` order (a live
 * `assistant_text_streaming` / `thinking_streaming` collapses to the persisted
 * `assistant_text` / `thinking` final — issue #363 — and a count-based match
 * keeps deliberate repeats, issue #381). The job is to weave back in the
 * `current` items history does NOT account for, at the position they hold in
 * `current` rather than dumping them at the end:
 *
 *   - A CLIENT-ONLY item sandwiched between two persisted turns keeps its slot.
 *     This matters for synthetic, never-persisted feed items — chiefly the
 *     `"Session error: …"` system message the desktop pushes on a failed turn
 *     (and any pre-session-id `provider_error`): the engine has no row for them,
 *     so the old tail-append re-pinned them to the bottom of the chat on every
 *     reload, dragging a stale error below turns that came after it (HOU-457).
 *   - A client-only item with NO persisted successor is genuine live tail (an
 *     optimistic send still awaiting its echo, a stream mid-flight) and appends
 *     after history, where it belongs.
 *
 * Persisted turns share the same chronological order in `current` and
 * `history`, so a single forward walk of each is enough — O(history + current),
 * Map-based, no per-compare re-stringify.
 */
export function mergeFeedHistory(
  history: FeedItem[],
  current: FeedItem[],
): FeedItem[] {
  if (current.length === 0) return history;

  // Remaining match budget per key, drawn down as we consume `history`. Lets us
  // tell a persisted `current` item (take it from history) from a client-only
  // one (keep it inline), count-based so duplicates stay distinct.
  const remaining = new Map<string, number>();
  for (const item of history) {
    const key = feedTurnKey(item);
    remaining.set(key, (remaining.get(key) ?? 0) + 1);
  }

  const merged: FeedItem[] = [];
  let hi = 0; // forward cursor into `history`
  // Client-only items seen since the last persisted anchor, held until we know
  // whether a persisted successor follows (→ splice in here) or not (→ tail).
  let pendingClientOnly: FeedItem[] = [];

  for (const item of current) {
    const key = feedTurnKey(item);
    if ((remaining.get(key) ?? 0) > 0) {
      // Persisted: the held client-only items had a persisted successor (this
      // one), so they belong right before it. Then advance `history` to and
      // including this item's match, emitting any history-only turns in between
      // (e.g. a background routine run the live bucket never saw).
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
      // Client-only (or a repeat beyond history's count): hold its position.
      pendingClientOnly.push(item);
    }
  }

  // Trailing history-only turns, then trailing client-only items (live tail).
  while (hi < history.length) merged.push(history[hi++]);
  merged.push(...pendingClientOnly);

  return merged;
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
