import {
  excluded,
  ObjectNotFoundError,
} from "@houston/runtime-client/object-sync";
import { FsVfs } from "./fs";
import { Materializer } from "./lazy-store-fetch";
import { LazyOwnership } from "./lazy-store-ownership";
import type { LazyStoreVfsOptions } from "./lazy-store-types";
import {
  assertSafeKey,
  decodeText,
  type ObjectStat,
  type Vfs,
  VfsExistsError,
} from "./vfs";

/**
 * A Vfs over an object store: listings/stats from the store manifest, an
 * object downloaded into the local overlay (`root`) the FIRST time a handler
 * reads it, writes and deletes in the overlay for the caller's sync-back.
 * The shared `manifest` is the sync-back ownership boundary (materialized
 * objects + UNREAD_HASH entries for keys written/deleted without a read);
 * untouched remote objects never enter it, so they are never re-uploaded
 * or deleted. Remote directories exist only as their descendants; writes
 * keep a real tree's file/directory exclusivity so the next eager hydrate
 * of the store cannot fail on a key that is both.
 */
export class LazyStoreVfs implements Vfs {
  private readonly local: FsVfs;
  private readonly state: LazyOwnership;
  private readonly downloads: Materializer;

  constructor(private readonly opts: LazyStoreVfsOptions) {
    this.local = new FsVfs(opts.root);
    this.state = new LazyOwnership(opts.manifest);
    this.downloads = new Materializer(opts);
    for (const object of opts.objects) {
      const rel = this.relOf(object.key);
      if (!rel || excluded(rel, opts.excludes)) continue;
      this.state.remote.set(rel, object);
    }
  }

  /** Whether the store mints generations (the sync-back CAS capability). */
  get generationAware(): boolean {
    return this.opts.objects.some((o) => o.generation !== undefined);
  }

  /** Remote keys (store-relative) this vfs knows about, excludes applied. */
  get remoteKeys(): string[] {
    return [...this.state.remote.keys()];
  }

  private relOf(storeKey: string): string | null {
    const { prefix } = this.opts;
    if (!prefix) return storeKey;
    return storeKey.startsWith(`${prefix}/`)
      ? storeKey.slice(prefix.length + 1)
      : null;
  }

  /**
   * The OVERLAY decides: every write and move this vfs performs lands there,
   * so its volume is what can silently replace a differently-cased neighbour.
   * (The remote manifest is exact, but no write reaches it except through the
   * overlay's sync-back.)
   */
  keyCase = () => this.local.keyCase();

  /**
   * The overlay OR the store: a remote object nobody has materialized still
   * occupies its key, and the overlay alone cannot see it.
   */
  async exists(key: string): Promise<boolean> {
    assertSafeKey(key);
    return (
      this.state.visible(key) !== undefined || (await this.local.exists(key))
    );
  }

  list = async (prefix: string) =>
    (await this.listDetailed(prefix)).map((s) => s.key);

  async listDetailed(prefix: string): Promise<ObjectStat[]> {
    assertSafeKey(prefix);
    const out = await this.local.listDetailed(prefix);
    const seen = new Set(out.map((s) => s.key));
    for (const [rel, meta] of this.state.under(prefix)) {
      if (seen.has(rel)) continue;
      out.push({
        key: rel,
        size: meta.size,
        updatedMs: Date.parse(meta.updated) || 0,
      });
    }
    return out.sort((a, b) => a.key.localeCompare(b.key));
  }

  async readText(key: string): Promise<string | null> {
    const buf = await this.readBytes(key);
    return buf ? decodeText(buf) : null;
  }

  async readBytes(key: string): Promise<Buffer | null> {
    assertSafeKey(key);
    const local = await this.local.readBytes(key);
    if (local !== null) return local;
    const meta = this.state.visible(key);
    if (!meta) return null;
    try {
      await this.downloads.fetch(key, meta);
    } catch (error) {
      if (!(error instanceof ObjectNotFoundError)) throw error;
      // Vanished between the listing and this first read: another writer
      // deleted it, so the key is absent — never a failed read
      // (HOUSTON-APP-5AS). Dropped from the remote view so listings agree.
      this.state.remote.delete(key);
      return null;
    }
    return this.local.readBytes(key);
  }

  writeText = (key: string, content: string) =>
    this.writeBytes(key, Buffer.from(content, "utf8"));

  async writeBytes(key: string, content: Buffer): Promise<void> {
    assertSafeKey(key);
    this.state.assertWritable(key);
    await this.downloads.settle(key);
    await this.local.writeBytes(key, content);
    this.state.written(key);
  }

  async deleteKey(key: string): Promise<void> {
    assertSafeKey(key);
    await this.downloads.settle(key);
    await this.local.deleteKey(key);
    this.state.tombstone(key);
  }

  async move(fromKey: string, toKey: string): Promise<void> {
    assertSafeKey(fromKey);
    assertSafeKey(toKey);
    // POSIX rename: onto itself is a no-op, into itself is an error.
    if (toKey === fromKey) return;
    if (toKey.startsWith(`${fromKey}/`)) {
      throw new Error(`move: destination is inside the source: ${fromKey}`);
    }
    const isFile =
      (await this.local.readBytes(fromKey)) !== null ||
      this.state.visible(fromKey);
    if (!isFile) {
      // A directory: exists only as its descendants. Move each one.
      const children = await this.listDetailed(fromKey);
      if (children.length === 0) {
        throw new Error(`move: source not found: ${fromKey}`);
      }
      if ((await this.listDetailed(toKey)).length > 0) {
        throw new Error(`move: destination is not empty: ${toKey}`);
      }
      for (const child of children) {
        await this.move(
          child.key,
          `${toKey}${child.key.slice(fromKey.length)}`,
        );
      }
      await this.local.deletePrefix(fromKey);
      return;
    }
    this.state.assertWritable(toKey);
    const meta = this.state.visible(fromKey);
    if ((await this.local.readBytes(fromKey)) === null && meta) {
      try {
        await this.downloads.fetch(fromKey, meta);
      } catch (error) {
        if (!(error instanceof ObjectNotFoundError)) throw error;
        this.state.remote.delete(fromKey);
        throw new Error(`move: source not found: ${fromKey}`);
      }
    }
    // The store's half is exact-keyed and invisible to the overlay's own
    // guard: an object nobody has read yet still occupies the destination.
    if (this.state.visible(toKey)) throw new VfsExistsError(toKey);
    await this.local.move(fromKey, toKey);
    this.state.written(toKey);
    this.state.tombstone(fromKey);
  }

  async deletePrefix(prefix: string): Promise<void> {
    assertSafeKey(prefix);
    await this.downloads.settleUnder(prefix);
    await this.local.deletePrefix(prefix);
    for (const [rel] of this.state.under(prefix)) this.state.tombstone(rel);
  }
}
