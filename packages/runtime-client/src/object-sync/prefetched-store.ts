import { writeAtomically } from "./http-store-batch";
import type { ObjectMetadata } from "./object-manifest";
import { underObjectPrefix } from "./object-prefix";
import type {
  BatchReadEntry,
  BatchReadOutcome,
  ObjectStore,
  ReadOptions,
  ReadResult,
  WriteOptions,
  WriteResult,
} from "./object-store";
import type { PrefetchedObjects, ScopedListing } from "./prefetched-objects";

export type { PrefetchedObjects, ScopedListing } from "./prefetched-objects";
export {
  CLAIMED_TURN_LISTING_SCOPE,
  parsePrefetchedObjects,
} from "./prefetched-objects";

/**
 * Serves hydration from the prefetched listing and bytes, and everything
 * else from the real store. A whole-store listing answers the FIRST manifest
 * call only (hydration's); a scoped one is taken once by the claimed turn's
 * lister (`takeScopedListing`) and never answers a manifest call. Each
 * inlined object is served once and then forgotten, and all of them are
 * forgotten at the first write, so later reads and every write see the live
 * store.
 */
export class PrefetchedObjectStore implements ObjectStore {
  private manifestServed = false;
  readonly manifestDir?: ObjectStore["manifestDir"];

  constructor(
    private readonly inner: ObjectStore,
    private readonly prefetched: PrefetchedObjects,
  ) {
    const dir = inner.manifestDir?.bind(inner);
    if (dir) this.manifestDir = dir;
  }

  /** Whether the first manifest call is answered from the prefetch. */
  get servesWholeListing(): boolean {
    return !this.manifestServed && this.prefetched.manifest !== undefined;
  }

  /** The gateway's scoped listing, once. */
  takeScopedListing(): ScopedListing | undefined {
    const listing = this.prefetched.listing;
    this.prefetched.listing = undefined;
    return listing;
  }

  list(prefix: string): Promise<string[]> {
    return this.inner.list(prefix);
  }

  async manifest(prefix = "", opts?: ReadOptions): Promise<ObjectMetadata[]> {
    const whole = this.servesWholeListing
      ? this.prefetched.manifest
      : undefined;
    this.manifestServed = true;
    if (whole) {
      return whole.filter((object) => underObjectPrefix(object.key, prefix));
    }
    if (this.inner.manifest) return this.inner.manifest(prefix, opts);
    const keys = await this.inner.list(prefix);
    return keys.map((key) => ({ key, size: 0, md5: "", updated: "" }));
  }

  download(
    key: string,
    destFile: string,
    opts?: ReadOptions,
  ): Promise<ReadResult> {
    return this.downloadVersioned(key, destFile, opts);
  }

  async downloadVersioned(
    key: string,
    destFile: string,
    opts?: ReadOptions,
  ): Promise<ReadResult> {
    const hit = this.take(key);
    if (hit) {
      if (!(await writeAtomically(destFile, hit.data)))
        return { refused: true };
      return hit.generation ? { generation: hit.generation } : {};
    }
    if (this.inner.downloadVersioned) {
      return this.inner.downloadVersioned(key, destFile, opts);
    }
    return (await this.inner.download(key, destFile, opts)) ?? {};
  }

  async downloadMany(
    entries: BatchReadEntry[],
    opts?: ReadOptions,
  ): Promise<Map<string, BatchReadOutcome>> {
    const outcomes = new Map<string, BatchReadOutcome>();
    const misses: BatchReadEntry[] = [];
    for (const entry of entries) {
      const hit = this.take(entry.key);
      if (!hit) {
        misses.push(entry);
        continue;
      }
      outcomes.set(
        entry.key,
        (await writeAtomically(entry.destFile, hit.data))
          ? {
              status: "ok",
              ...(hit.generation ? { generation: hit.generation } : {}),
            }
          : { status: "refused" },
      );
    }
    if (misses.length === 0) return outcomes;
    if (!this.inner.downloadMany) {
      for (const { key } of misses) outcomes.set(key, { status: "fallback" });
      return outcomes;
    }
    const rest = await this.inner.downloadMany(misses, opts);
    for (const [key, outcome] of rest) outcomes.set(key, outcome);
    return outcomes;
  }

  upload(
    srcFile: string,
    key: string,
    opts?: WriteOptions,
    // biome-ignore lint/suspicious/noConfusingVoidType: ObjectStore preserves void-returning adapters.
  ): Promise<WriteResult | void> {
    this.forgetInlined();
    return this.inner.upload(srcFile, key, opts);
  }

  delete(key: string, opts?: WriteOptions): Promise<void> {
    this.forgetInlined();
    return this.inner.delete(key, opts);
  }

  /** The inlined bytes were read before the turn held its claim. Once it
   *  writes, a read is a conflict refresh or a re-read after a write, and
   *  only the live store can answer it. */
  private forgetInlined() {
    this.prefetched.objects.clear();
  }

  private take(key: string) {
    const hit = this.prefetched.objects.get(key);
    if (hit) this.prefetched.objects.delete(key);
    return hit;
  }
}
