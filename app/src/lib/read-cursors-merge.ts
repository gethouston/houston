import {
  capCursors,
  type ReadCursor,
  type ReadCursorStore,
} from "./read-cursors.ts";

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
    cursors: capCursors(cursors),
  };
}
