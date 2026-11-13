import {
  isUploadStore,
  keepsMergeBase,
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
  VfsReadLimitError,
} from "./vfs";

export class LazyStoreVfs implements Vfs {
  private readonly local: FsVfs;
  private readonly state: LazyOwnership;
  private readonly downloads: Materializer;

  constructor(private readonly opts: LazyStoreVfsOptions) {
    this.local = new FsVfs(opts.root);
    this.state = new LazyOwnership(opts.manifest);
    this.downloads = new Materializer(opts);
    this.state.ingest(opts.objects, opts.prefix, opts.excludes);
  }

  get uploadStore() {
    return isUploadStore(this.opts.store) ? this.opts.store : undefined;
  }

  async copyUpload(
    uploadId: string,
    key: string,
    generation: string,
  ): Promise<void> {
    assertSafeKey(key);
    this.state.assertWritable(key);
    if (!this.uploadStore) throw new Error("upload store not configured");
    if (await this.exists(key)) throw new VfsExistsError(key);
    const storeKey = this.opts.prefix ? `${this.opts.prefix}/${key}` : key;
    const copied = await this.uploadStore.copyUpload(
      uploadId,
      storeKey,
      generation,
    );
    // A store-side copy stays remote and outside sync-back ownership until read or changed.
    this.state.copied(key, {
      ...copied,
      md5: "",
      updated: new Date().toISOString(),
    });
  }

  /** Whether the store mints generations (the sync-back CAS capability). */
  get generationAware(): boolean {
    return [...this.opts.objects, ...this.state.remote.values()].some(
      (o) => o.generation !== undefined,
    );
  }

  get remoteKeys(): string[] {
    return [...this.state.remote.keys()];
  }

  keyCase = () => this.local.keyCase();

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

  async readBytes(key: string, maxBytes?: number): Promise<Buffer | null> {
    assertSafeKey(key);
    const local = await this.local.readBytes(key, maxBytes);
    if (local !== null) return local;
    const meta = this.state.visible(key);
    if (!meta) return null;
    if (maxBytes !== undefined && meta.size > maxBytes)
      throw new VfsReadLimitError();
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
    return this.local.readBytes(key, maxBytes);
  }

  writeText = (key: string, content: string) =>
    this.writeBytes(key, Buffer.from(content, "utf8"));

  async writeBytes(key: string, content: Buffer): Promise<void> {
    assertSafeKey(key);
    this.state.assertWritable(key);
    // Whole-list writes keep the old bytes for three-way conflict merging.
    if (keepsMergeBase(key) && !(await this.local.exists(key)))
      await this.readBytes(key);
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
      // Typed, like the single-object refusal below: `moveOrRefuse` turns a
      // VfsExistsError into the 409 "already exists there" the user can act
      // on. A plain Error would surface a fixable name collision as a 500.
      if ((await this.listDetailed(toKey)).length > 0) {
        throw new VfsExistsError(toKey);
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
