import {
  assertSafeKey,
  decodeText,
  type KeyCase,
  type ObjectStat,
  type Vfs,
  VfsExistsError,
} from "./vfs";

interface Entry {
  content: Buffer;
  updatedMs: number;
  createdMs: number;
}

export interface MemoryVfsOptions {
  /**
   * The disk this store stands in for. A `folded` MemoryVfs really does
   * resolve `README.md` to a stored `readme.md` — it does not merely REPORT
   * the fold — so a collision guard tested against it is tested against the
   * data loss it exists to prevent, on a CI volume of either kind.
   */
  keyCase?: KeyCase;
}

/** In-memory Vfs for tests and CP_DEV=1. */
export class MemoryVfs implements Vfs {
  private files = new Map<string, Entry>();
  private clock = 1;
  private readonly mode: KeyCase;

  constructor(opts: MemoryVfsOptions = {}) {
    this.mode = opts.keyCase ?? { fold: "exact", normalize: false };
  }

  async keyCase(): Promise<KeyCase> {
    return this.mode;
  }

  /** The spelling this store compares by. */
  private fold(key: string): string {
    const cased = this.mode.fold === "folded" ? key.toLowerCase() : key;
    return this.mode.normalize ? cased.normalize("NFC") : cased;
  }

  /** The key an existing object is STORED under, or `key` when there is none. */
  private slot(key: string): string {
    if (this.files.has(key)) return key;
    if (this.mode.fold === "exact" && !this.mode.normalize) return key;
    const folded = this.fold(key);
    for (const k of this.files.keys()) if (this.fold(k) === folded) return k;
    return key;
  }

  private under(prefix: string): [string, Entry][] {
    const p = this.fold(`${prefix}/`);
    return [...this.files.entries()].filter(([k]) =>
      this.fold(k).startsWith(p),
    );
  }

  async exists(key: string): Promise<boolean> {
    return this.files.has(this.slot(key));
  }

  async list(prefix: string): Promise<string[]> {
    return this.under(prefix)
      .map(([k]) => k)
      .sort();
  }

  async listDetailed(prefix: string): Promise<ObjectStat[]> {
    return this.under(prefix)
      .map(([key, v]) => ({
        key,
        size: v.content.byteLength,
        updatedMs: v.updatedMs,
        createdMs: v.createdMs,
      }))
      .sort((a, b) => a.key.localeCompare(b.key));
  }

  async readText(key: string): Promise<string | null> {
    const buf = this.files.get(this.slot(key))?.content;
    return buf ? decodeText(buf) : null;
  }

  async readBytes(key: string): Promise<Buffer | null> {
    return this.files.get(this.slot(key))?.content ?? null;
  }

  async writeText(key: string, content: string): Promise<void> {
    await this.writeBytes(key, Buffer.from(content, "utf8"));
  }

  async writeBytes(key: string, content: Buffer): Promise<void> {
    assertSafeKey(key);
    // Writing a differently-cased spelling opens the object that is already
    // there and leaves its NAME alone, exactly as `open(2)` does on a folded
    // volume. An overwrite keeps the original creation time.
    const slot = this.slot(key);
    const createdMs = this.files.get(slot)?.createdMs ?? this.clock;
    this.files.set(slot, { content, updatedMs: this.clock++, createdMs });
  }

  async deleteKey(key: string): Promise<void> {
    this.files.delete(this.slot(key));
  }

  async move(fromKey: string, toKey: string): Promise<void> {
    assertSafeKey(toKey);
    const from = this.slot(fromKey);
    const v = this.files.get(from);
    if (!v) throw new Error(`move: source not found: ${fromKey}`);
    // The same door FsVfs puts in front of `rename(2)`, answered by this
    // store's own slot resolution: a destination that resolves to a DIFFERENT
    // stored object would be destroyed without a word. Re-spelling the source
    // (`readme.md` → `README.md` on a folded store) resolves to the source
    // itself and is a rename the user asked for.
    const occupant = this.slot(toKey);
    if (occupant !== from && this.files.has(occupant)) {
      throw new VfsExistsError(toKey);
    }
    this.files.delete(from);
    // A move keeps the creation time — renaming a file doesn't re-create it —
    // and the object carries the spelling it was GIVEN, which is what makes a
    // case-only rename a real rename.
    this.files.set(toKey, {
      content: v.content,
      updatedMs: this.clock++,
      createdMs: v.createdMs,
    });
  }

  async deletePrefix(prefix: string): Promise<void> {
    for (const [k] of this.under(prefix)) this.files.delete(k);
  }
}
