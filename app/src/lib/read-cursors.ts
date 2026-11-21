export interface ReadCursor {
  readAt: number;
  notifiedAt?: number;
}

export interface ReadCursorStore {
  since: number;
  cursors: Record<string, ReadCursor>;
}

const MAX_CURSORS = 500;

export function cursorKey(agentPath: string, conversationId: string): string {
  return `${agentPath}::${conversationId}`;
}

function touchedAt(cursor: ReadCursor): number {
  return Math.max(cursor.readAt, cursor.notifiedAt ?? 0);
}

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

export function markRead(
  store: ReadCursorStore,
  key: string,
  at: number,
): ReadCursorStore {
  const current = store.cursors[key];
  if (current && current.readAt >= at) return store;
  return withCursor(store, key, { ...current, readAt: at });
}

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

export function readFloorFor(store: ReadCursorStore, key: string): number {
  return store.cursors[key]?.readAt ?? store.since;
}

export function notifiedFloorFor(store: ReadCursorStore, key: string): number {
  const cursor = store.cursors[key];
  if (!cursor) return store.since;
  return Math.max(cursor.notifiedAt ?? store.since, cursor.readAt);
}

export function mentionReadFloorFor(
  store: ReadCursorStore,
  key: string,
): number {
  return store.cursors[key]?.readAt ?? 0;
}
