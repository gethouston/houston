/**
 * A capacity-bounded, optionally idle-expiring LRU map.
 *
 * A long-lived runtime process opens an unbounded number of agent sessions over
 * its lifetime; a plain `Map` keyed by conversation would retain every one
 * forever. This map keeps only the {@link LruOptions.capacity} most-recently
 * used entries (plus any {@link LruOptions.isPinned pinned} ones, which are
 * NEVER evicted — a session running or queuing a turn must not be disposed from
 * under it). {@link LruOptions.onEvict} runs on eviction so the caller can
 * release the evicted value (dispose a session, clear a snapshot). Eviction is
 * safe only where the value can be transparently rebuilt on next access — here
 * both callers re-hydrate from authoritative on-disk / history state.
 *
 * Recency is insertion order in the backing `Map`: {@link get}/{@link set}/
 * {@link touch} move a key to the most-recent end, and eviction walks from the
 * least-recent end. Values are objects (never `undefined`), so `undefined` is an
 * unambiguous "absent".
 *
 * NOTE: an identical copy lives in `@houston/sdk`'s `src/lru.ts`. The two
 * packages share no code dependency they could host a common util in (protocol
 * is wire types only), so this small, standard structure is duplicated rather
 * than forced through a boundary it doesn't belong in.
 */
export interface LruOptions<K, V> {
  /** Max unpinned entries retained. Exceeding it evicts least-recently-used. */
  capacity: number;
  /**
   * Optional idle expiry (ms). {@link sweepIdle} evicts every unpinned entry
   * untouched for at least this long. Omit to disable idle eviction (cap only).
   */
  idleMs?: number;
  /** Clock, injectable for tests. Defaults to {@link Date.now}. */
  now?: () => number;
  /** Pinned entries are never evicted (a live/in-flight value). */
  isPinned?: (key: K, value: V) => boolean;
  /** Runs after an entry is evicted (release/dispose the value). */
  onEvict?: (key: K, value: V) => void;
}

export class LruCache<K, V> {
  private readonly map = new Map<K, V>();
  private readonly seen = new Map<K, number>();
  private readonly now: () => number;

  constructor(private readonly opts: LruOptions<K, V>) {
    this.now = opts.now ?? Date.now;
  }

  get size(): number {
    return this.map.size;
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  /** Read WITHOUT bumping recency. */
  peek(key: K): V | undefined {
    return this.map.get(key);
  }

  /** Read and mark most-recently-used. */
  get(key: K): V | undefined {
    const v = this.map.get(key);
    if (v !== undefined) this.touch(key);
    return v;
  }

  set(key: K, value: V): void {
    this.map.delete(key);
    this.map.set(key, value);
    this.seen.set(key, this.now());
    this.evictOverflow();
  }

  /** Move `key` to most-recently-used and restamp its idle clock. */
  touch(key: K): void {
    const v = this.map.get(key);
    if (v === undefined) return;
    this.map.delete(key);
    this.map.set(key, v);
    this.seen.set(key, this.now());
  }

  delete(key: K): boolean {
    this.seen.delete(key);
    return this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
    this.seen.clear();
  }

  values(): IterableIterator<V> {
    return this.map.values();
  }

  entries(): IterableIterator<[K, V]> {
    return this.map.entries();
  }

  /** Evict every unpinned entry idle for at least {@link LruOptions.idleMs}. */
  sweepIdle(): void {
    const { idleMs } = this.opts;
    if (idleMs === undefined) return;
    const cutoff = this.now() - idleMs;
    for (const [k, v] of [...this.map]) {
      if ((this.seen.get(k) ?? 0) > cutoff) continue;
      if (this.opts.isPinned?.(k, v)) continue;
      this.evictEntry(k, v);
    }
  }

  private evictOverflow(): void {
    if (this.map.size <= this.opts.capacity) return;
    for (const [k, v] of [...this.map]) {
      if (this.map.size <= this.opts.capacity) break;
      if (this.opts.isPinned?.(k, v)) continue;
      this.evictEntry(k, v);
    }
  }

  private evictEntry(k: K, v: V): void {
    this.map.delete(k);
    this.seen.delete(k);
    this.opts.onEvict?.(k, v);
  }
}
