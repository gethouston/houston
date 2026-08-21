import { mkdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  excluded,
  fileSha256,
  type ObjectMetadata,
} from "@houston/runtime-client/object-sync";
import { FsVfs } from "./fs";
import {
  LazyObjectTooLargeError,
  type LazyStoreVfsOptions,
  UNREAD_HASH,
} from "./lazy-store-types";
import { assertSafeKey, decodeText, type ObjectStat, type Vfs } from "./vfs";

/**
 * A Vfs over an object store that downloads an object the FIRST time a
 * handler reads it, never before. Listings and stats come from the store's
 * manifest; reads materialize one key into a local overlay (`root`); writes
 * and deletes land in the overlay and are carried to the store by the
 * caller's sync-back pass, exactly as a fully hydrated tree would be.
 *
 * The shared `manifest` is the sync-back ownership boundary: a key enters it
 * when it is materialized (with its real hash + generation) or when it is
 * overwritten / deleted before ever being read (an UNREAD_HASH entry carrying
 * the store's generation). A remote object that was never touched stays out
 * of the manifest, so a sync-back can neither re-upload nor delete it.
 */
export class LazyStoreVfs implements Vfs {
  private readonly local: FsVfs;
  private readonly remote = new Map<string, ObjectMetadata>();
  /** Remote keys deleted (or moved away) locally: hidden from every read. */
  private readonly hidden = new Set<string>();
  private readonly inflight = new Map<string, Promise<void>>();

  constructor(private readonly opts: LazyStoreVfsOptions) {
    this.local = new FsVfs(opts.root);
    for (const object of opts.objects) {
      const rel = this.relOf(object.key);
      if (!rel || excluded(rel, opts.excludes)) continue;
      this.remote.set(rel, object);
    }
  }

  private relOf(storeKey: string): string | null {
    const { prefix } = this.opts;
    if (!prefix) return storeKey;
    return storeKey.startsWith(`${prefix}/`)
      ? storeKey.slice(prefix.length + 1)
      : null;
  }

  private storeKey(rel: string): string {
    return this.opts.prefix ? `${this.opts.prefix}/${rel}` : rel;
  }

  /** Remote keys visible under `prefix/` (not hidden). */
  private remoteUnder(prefix: string): [string, ObjectMetadata][] {
    const under = `${prefix}/`;
    return [...this.remote].filter(
      ([rel]) => rel.startsWith(under) && !this.hidden.has(rel),
    );
  }

  async list(prefix: string): Promise<string[]> {
    return (await this.listDetailed(prefix)).map((s) => s.key);
  }

  async listDetailed(prefix: string): Promise<ObjectStat[]> {
    assertSafeKey(prefix);
    const out = await this.local.listDetailed(prefix);
    const seen = new Set(out.map((s) => s.key));
    for (const [rel, meta] of this.remoteUnder(prefix)) {
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
    const meta = this.remote.get(key);
    if (!meta || this.hidden.has(key)) return null;
    await this.materialize(key, meta);
    return this.local.readBytes(key);
  }

  /** Download one object into the overlay once; concurrent reads share it. */
  private materialize(key: string, meta: ObjectMetadata): Promise<void> {
    const pending = this.inflight.get(key);
    if (pending) return pending;
    const run = (async () => {
      if (meta.size > this.opts.maxObjectBytes) {
        throw new LazyObjectTooLargeError(
          key,
          meta.size,
          this.opts.maxObjectBytes,
        );
      }
      const dest = join(this.opts.root, ...key.split("/"));
      await mkdir(dirname(dest), { recursive: true });
      await this.opts.store.download(this.storeKey(key), dest);
      const { size } = await stat(dest);
      this.opts.manifest.set(key, {
        hash: await fileSha256(dest, size),
        ...(meta.generation !== undefined
          ? { generation: meta.generation }
          : {}),
      });
    })().finally(() => this.inflight.delete(key));
    this.inflight.set(key, run);
    return run;
  }

  async writeText(key: string, content: string): Promise<void> {
    await this.writeBytes(key, Buffer.from(content, "utf8"));
  }

  async writeBytes(key: string, content: Buffer): Promise<void> {
    assertSafeKey(key);
    await this.local.writeBytes(key, content);
    this.hidden.delete(key);
    this.own(key);
  }

  /** Put an unread remote key under sync-back ownership (CAS on its generation). */
  private own(rel: string): void {
    const meta = this.remote.get(rel);
    if (!meta || this.opts.manifest.has(rel)) return;
    this.opts.manifest.set(rel, {
      hash: UNREAD_HASH,
      ...(meta.generation !== undefined ? { generation: meta.generation } : {}),
    });
  }

  /** Hide a remote key from reads and make sure sync-back deletes it. */
  private tombstone(rel: string): void {
    if (!this.remote.has(rel)) return;
    this.hidden.add(rel);
    this.own(rel);
  }

  async deleteKey(key: string): Promise<void> {
    assertSafeKey(key);
    await this.local.deleteKey(key);
    this.tombstone(key);
  }

  async move(fromKey: string, toKey: string): Promise<void> {
    assertSafeKey(fromKey);
    assertSafeKey(toKey);
    if ((await this.local.readBytes(fromKey)) === null) {
      const meta = this.remote.get(fromKey);
      if (!meta || this.hidden.has(fromKey)) {
        throw new Error(`move: source not found: ${fromKey}`);
      }
      await this.materialize(fromKey, meta);
    }
    await this.local.move(fromKey, toKey);
    this.hidden.delete(toKey);
    this.own(toKey);
    this.tombstone(fromKey);
  }

  async deletePrefix(prefix: string): Promise<void> {
    assertSafeKey(prefix);
    await this.local.deletePrefix(prefix);
    for (const [rel] of this.remoteUnder(prefix)) this.tombstone(rel);
  }
}
