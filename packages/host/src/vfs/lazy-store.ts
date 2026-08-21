import {
  excluded,
  type ObjectMetadata,
} from "@houston/runtime-client/object-sync";
import { FsVfs } from "./fs";
import { fetchObject, type LazyBudget } from "./lazy-store-fetch";
import { LazyOwnership } from "./lazy-store-ownership";
import type { LazyStoreVfsOptions } from "./lazy-store-types";
import { assertSafeKey, decodeText, type ObjectStat, type Vfs } from "./vfs";

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
  private readonly inflight = new Map<string, Promise<void>>();
  private readonly budget: LazyBudget = { materializedBytes: 0 };

  constructor(private readonly opts: LazyStoreVfsOptions) {
    this.local = new FsVfs(opts.root);
    this.state = new LazyOwnership(opts.manifest);
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
    await this.materialize(key, meta);
    return this.local.readBytes(key);
  }

  /** Download one object into the overlay once; concurrent reads share it. */
  private materialize(key: string, meta: ObjectMetadata): Promise<void> {
    const pending = this.inflight.get(key);
    if (pending) return pending;
    const run = fetchObject(this.opts, this.budget, key, meta).finally(() =>
      this.inflight.delete(key),
    );
    this.inflight.set(key, run);
    return run;
  }

  /** Never race a download's rename over a local write of the same key. */
  private settle = (key: string) =>
    this.inflight.get(key)?.catch(() => undefined);

  writeText = (key: string, content: string) =>
    this.writeBytes(key, Buffer.from(content, "utf8"));

  async writeBytes(key: string, content: Buffer): Promise<void> {
    assertSafeKey(key);
    this.state.assertWritable(key);
    await this.settle(key);
    await this.local.writeBytes(key, content);
    this.state.written(key);
  }

  async deleteKey(key: string): Promise<void> {
    assertSafeKey(key);
    await this.settle(key);
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
      await this.materialize(fromKey, meta);
    }
    await this.local.move(fromKey, toKey);
    this.state.written(toKey);
    this.state.tombstone(fromKey);
  }

  async deletePrefix(prefix: string): Promise<void> {
    assertSafeKey(prefix);
    const under = `${prefix}/`;
    for (const key of this.inflight.keys()) {
      if (key.startsWith(under)) await this.settle(key);
    }
    await this.local.deletePrefix(prefix);
    for (const [rel] of this.state.under(prefix)) this.state.tombstone(rel);
  }
}
