/**
 * What the local conversation cache stores, and what it stores THROUGH
 * (HOU-712) — the record shapes plus the storage port the operations in
 * `conversation-cache.ts` run on (IndexedDB in the app, in-memory in tests).
 *
 * Declared apart from the operations so the IndexedDB backend can depend on the
 * contract alone: it implements {@link ConversationCacheBackend} without
 * importing the module that installs it.
 */

/** One cached feed frame — the folded `{feed_type, data}` the VM seeds from. */
export interface CachedFrame {
  feed_type: string;
  data: unknown;
  /**
   * The frame's timestamp, when the source fold carried one — preserved so a
   * cache-painted bubble keeps its real time instead of losing it (HOU-819).
   * Display metadata only: seed/replace decisions never compare timestamps
   * (live pushes and history folds are stamped by different clocks). Absent
   * on records written before this field existed.
   */
  ts?: number;
  /**
   * Who wrote this `user_message` in a shared conversation (HOU-943), carried
   * so a cache-painted transcript names its senders immediately instead of
   * going anonymous until the server read lands. Absent single-player and on
   * records written before this field existed.
   */
  author?: { userId: string; name?: string };
  /**
   * The teammates this `user_message` @mentions (HOU-944), carried so a
   * cache-painted transcript chips the same names immediately instead of
   * rendering plain text until the server read lands. Absent when the message
   * mentioned nobody and on records written before this field existed.
   */
  mentions?: { userId: string; name?: string }[];
}

/** A stored transcript: its frames plus a write stamp (prune order). */
export interface CacheRecord {
  frames: CachedFrame[];
  updatedAt: number;
}

/** The storage the cache runs on — IndexedDB in the app, in-memory in tests. */
export interface ConversationCacheBackend {
  get(key: string): Promise<CacheRecord | null>;
  set(key: string, record: CacheRecord): Promise<void>;
  delete(key: string): Promise<void>;
  /**
   * Every stored key, oldest write first — the prune sweep's input. Keys
   * ONLY: the sweep runs on every write, so it must never load transcripts.
   */
  keysOldestFirst(): Promise<string[]>;
  clear(): Promise<void>;
}
