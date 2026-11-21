export interface LruOptions<K, V> {
  capacity: number;
  idleMs?: number;
  now?: () => number;
  isPinned?: (key: K, value: V) => boolean;
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

  peek(key: K): V | undefined {
    return this.map.get(key);
  }

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
