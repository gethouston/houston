import {
  capCursors,
  type ReadCursor,
  type ReadCursorStore,
} from "./read-cursors.ts";

/**
 * Combining two views of the SAME user's read cursors (HOU-945).
 *
 * It exists because the store persists as ONE whole-blob value per user, and a
 * browser lets the user open Houston in as many tabs as they like. A plain
 * overwrite is therefore last-writer-wins: the tab that saves second silently
 * erases every mission the other tab marked read while it was open, and the
 * badges the user already cleared light up again on the next reload.
 *
 * The rule is per conversation, never per blob: take the LATER of each
 * watermark. A cursor can then only be lost if both views are behind on it,
 * which cannot happen. Read cursors only ever move forward in time, which is
 * what makes this merge (rather than a lock, a lease, or a broadcast channel)
 * the honest fix: the two tabs are not in conflict, they each know part of the
 * truth.
 *
 * Split out of `read-cursors.ts` because that module answers "what does one
 * view of the world say?" while this one answers "how do two of them combine?"
 * — and because keeping the algebra readable matters more than keeping it in
 * one file.
 */

/** The later of each watermark; returns `a` when it already leads on both, so
 *  the merge above can detect "nothing changed" by identity. */
function mergeCursor(a: ReadCursor, b: ReadCursor): ReadCursor {
  const readAt = Math.max(a.readAt, b.readAt);
  const notifiedAt =
    a.notifiedAt === undefined
      ? b.notifiedAt
      : b.notifiedAt === undefined
        ? a.notifiedAt
        : Math.max(a.notifiedAt, b.notifiedAt);
  if (readAt === a.readAt && notifiedAt === a.notifiedAt) return a;
  return notifiedAt === undefined ? { readAt } : { readAt, notifiedAt };
}

/**
 * Merge `incoming` into `base`, taking the later of every watermark.
 *
 * `since` takes the EARLIER of the two, because it records when this device
 * first knew this user: adopting a later floor would silently mark somebody's
 * backlog read, which is the one direction this feature must never move in
 * without the user's own gesture.
 *
 * Returns `base` unchanged when `incoming` contributes nothing, so merging on
 * every save costs no extra write and no re-render on the overwhelmingly common
 * path where this tab is the only writer — the same skip-the-write contract the
 * cursor mutators give.
 */
export function mergeReadCursorStores(
  base: ReadCursorStore,
  incoming: ReadCursorStore,
): ReadCursorStore {
  let changed = incoming.since < base.since;
  const cursors: Record<string, ReadCursor> = { ...base.cursors };
  for (const [key, other] of Object.entries(incoming.cursors)) {
    const mine = cursors[key];
    if (mine !== undefined) {
      const merged = mergeCursor(mine, other);
      if (merged === mine) continue;
      cursors[key] = merged;
    } else {
      cursors[key] = other;
    }
    changed = true;
  }
  if (!changed) return base;
  return {
    since: Math.min(base.since, incoming.since),
    // A union of two tabs' cursor sets is the other way the map can cross the
    // growth cap, and it must land on the same survivors a single tab would.
    cursors: capCursors(cursors),
  };
}
