/**
 * Per-user last-read cursors and the mention-notification watermark (HOU-945)
 * — the local memory behind "this mission has something new for me" and behind
 * "I have already been pinged about this mention".
 *
 * Client-side on purpose: read state is a per-device convenience, not shared
 * team truth, and routing it through the gateway would put a write on every
 * mission open.
 *
 * This module is the cursor ALGEBRA alone: pure, DOM-free, importable under
 * plain node, so every rule below is unit-tested without a browser. The two
 * siblings own the edges — `read-cursors-storage.ts` decides where the blob
 * lives, how concurrent tabs merge into it and when a signed-out account's
 * cursors are evicted; `read-cursors-parse.ts` decides what an untrusted stored
 * blob may be trusted to say.
 *
 * Three invariants the callers depend on:
 * - **`since` is the floor.** A conversation with no cursor of its own is
 *   treated as read up to the moment this store was created. Without it,
 *   signing in on a second device would mark years of history unread on day
 *   one, and re-notify every mention that ever happened.
 * - **Reading a mission counts as having seen its mentions**
 *   ({@link notifiedFloorFor}) — otherwise an @mention could OS-ping the user
 *   about a conversation open on their screen.
 * - **Every mutator returns the SAME reference when nothing changed**
 *   ({@link markRead}, {@link markMentionNotified}, {@link
 *   mergeReadCursorStores}), so callers skip the write (and the React state
 *   update) without diffing.
 */

/** What we remember about one conversation, per signed-in user. */
export interface ReadCursor {
  /** Epoch ms the user last had this conversation open. */
  readAt: number;
  /** Epoch ms of the newest mention of this user we have already OS-notified. */
  notifiedAt?: number;
}

export interface ReadCursorStore {
  /** Epoch ms this store was first created for this user — the FLOOR for every
   *  conversation with no cursor of its own. Without it, signing in on a second
   *  device would mark years of history unread on day one. */
  since: number;
  cursors: Record<string, ReadCursor>;
}

/**
 * How many conversations we remember per user. Cursors are unbounded by nature
 * — every mission ever opened would earn one — and localStorage is a hard ~5MB
 * per origin shared with the query persister, so an uncapped store would
 * eventually make the whole shell fail to persist anything. 500 is far beyond
 * any real backlog of missions a person revisits, and the entries we drop are
 * the least recently touched, whose floor gracefully degrades to `since`.
 */
const MAX_CURSORS = 500;

/** The stable per-conversation key. */
export function cursorKey(agentPath: string, conversationId: string): string {
  return `${agentPath}::${conversationId}`;
}

/** How recently this cursor was touched at all, by either watermark. */
function touchedAt(cursor: ReadCursor): number {
  return Math.max(cursor.readAt, cursor.notifiedAt ?? 0);
}

/**
 * Keep the {@link MAX_CURSORS} most recently touched keys. Ties break on the
 * key so the surviving set is deterministic across runs.
 *
 * Exported for `read-cursors-merge.ts` alone: a merge unions two tabs' cursor
 * sets and so is the other way the map can cross the cap, and it must land on
 * the SAME survivors this module would have kept.
 */
export function capCursors(
  cursors: Record<string, ReadCursor>,
): Record<string, ReadCursor> {
  const entries = Object.entries(cursors);
  if (entries.length <= MAX_CURSORS) return cursors;
  entries.sort(
    (a, b) => touchedAt(b[1]) - touchedAt(a[1]) || a[0].localeCompare(b[0]),
  );
  return Object.fromEntries(entries.slice(0, MAX_CURSORS));
}

function withCursor(
  store: ReadCursorStore,
  key: string,
  cursor: ReadCursor,
): ReadCursorStore {
  return {
    since: store.since,
    cursors: capCursors({ ...store.cursors, [key]: cursor }),
  };
}

/** Returns the SAME store reference when the cursor is already at/after `at`,
 *  so callers skip the write. */
export function markRead(
  store: ReadCursorStore,
  key: string,
  at: number,
): ReadCursorStore {
  const current = store.cursors[key];
  if (current && current.readAt >= at) return store;
  return withCursor(store, key, { ...current, readAt: at });
}

/**
 * Record that we have OS-notified the user about a mention at `at`. Same
 * skip-the-write contract as {@link markRead}.
 *
 * Creating a cursor here seeds `readAt` with the store's `since`, NOT with
 * `at`: being pinged about a mission is not the same as having read it, and
 * seeding the read floor forward would silently clear the unread badge the ping
 * was announcing. Seeding it with `since` leaves {@link readFloorFor}
 * answering exactly what it answered before this call.
 */
export function markMentionNotified(
  store: ReadCursorStore,
  key: string,
  at: number,
): ReadCursorStore {
  const current = store.cursors[key];
  if (current?.notifiedAt !== undefined && current.notifiedAt >= at)
    return store;
  return withCursor(store, key, {
    readAt: current?.readAt ?? store.since,
    notifiedAt: at,
  });
}

/** The read floor for one conversation: its own cursor, else the store's `since`. */
export function readFloorFor(store: ReadCursorStore, key: string): number {
  return store.cursors[key]?.readAt ?? store.since;
}

/**
 * The floor an @mention must beat to earn an OS notification: the newest
 * mention we have already pinged about, or the moment the user last OPENED the
 * conversation, whichever is later (else the store's `since`).
 *
 * Folding `readAt` in is what stops the ping the user can already see.
 * {@link markRead} deliberately never touches `notifiedAt` — the two
 * watermarks answer different questions, and collapsing them at write time
 * would let opening a mission claim we had pinged about a mention that is still
 * outstanding in the badge. So they are combined HERE, at the one place that
 * asks "do I still owe this user a ping?", where the answer is plainly no:
 * a mention that landed in a conversation on my screen, or that predates the
 * moment I opened it after a reload, has already been seen.
 */
export function notifiedFloorFor(store: ReadCursorStore, key: string): number {
  const cursor = store.cursors[key];
  if (!cursor) return store.since;
  return Math.max(cursor.notifiedAt ?? store.since, cursor.readAt);
}

/**
 * The read floor for a conversation that @MENTIONS me, which deliberately does
 * NOT fall back to `since`: a mention names me personally, so "I have never
 * opened this conversation" means the mention is still outstanding, however old
 * it is. `since` exists to stop a fresh device flooding its badge with a
 * backlog of ambient movement, and a mention is not ambient movement. Without
 * this, signing in on a second device would silently mark every mention that
 * predates the install as read, which is precisely the miss this feature was
 * built to prevent.
 */
export function mentionReadFloorFor(
  store: ReadCursorStore,
  key: string,
): number {
  return store.cursors[key]?.readAt ?? 0;
}
