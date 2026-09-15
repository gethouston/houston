import { mkdir, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  fileSha256,
  type ObjectMetadata,
} from "@houston/runtime-client/object-sync";
import {
  LazyReadRefusedError,
  type LazyStoreVfsOptions,
} from "./lazy-store-types";

/** Bytes one lazy vfs has materialized so far (its aggregate budget). */
export interface LazyBudget {
  materializedBytes: number;
}

/**
 * Download one object into the overlay and record it in the ownership
 * manifest. Both caps are checked from the manifest size BEFORE the download
 * and again from the bytes that landed (a stale manifest must not let an
 * oversized object through); a refused object leaves nothing on disk.
 */
export async function fetchObject(
  opts: Pick<
    LazyStoreVfsOptions,
    "store" | "prefix" | "root" | "manifest" | "maxObjectBytes" | "maxBytes"
  >,
  budget: LazyBudget,
  key: string,
  meta: ObjectMetadata,
): Promise<void> {
  const { maxObjectBytes, maxBytes } = opts;
  if (meta.size > maxObjectBytes) {
    throw new LazyReadRefusedError("object", key, meta.size, maxObjectBytes);
  }
  if (budget.materializedBytes + meta.size > maxBytes) {
    throw new LazyReadRefusedError("total", key, meta.size, maxBytes);
  }
  const dest = join(opts.root, ...key.split("/"));
  await mkdir(dirname(dest), { recursive: true });
  try {
    await opts.store.download(
      opts.prefix ? `${opts.prefix}/${key}` : key,
      dest,
    );
    const { size } = await stat(dest);
    if (size > maxObjectBytes) {
      throw new LazyReadRefusedError("object", key, size, maxObjectBytes);
    }
    if (budget.materializedBytes + size > maxBytes) {
      throw new LazyReadRefusedError("total", key, size, maxBytes);
    }
    const hash = await fileSha256(dest, size);
    opts.manifest.set(key, {
      hash,
      ...(meta.generation !== undefined ? { generation: meta.generation } : {}),
    });
    budget.materializedBytes += size;
  } catch (error) {
    // Nothing half-fetched may survive: a partial or unhashed file would be
    // read back as content and taken by the sync-back for a fresh local
    // write. The store adapter need not replace the destination atomically.
    await rm(dest, { force: true });
    throw error;
  }
}

/**
 * In-flight downloads, deduplicated by key: two concurrent reads of the same
 * object share one fetch, and a local write never races the rename that lands
 * one. Owns the vfs's aggregate byte budget, since only a download spends it.
 */
export class Materializer {
  private readonly inflight = new Map<string, Promise<void>>();
  private readonly budget: LazyBudget = { materializedBytes: 0 };

  constructor(private readonly opts: Parameters<typeof fetchObject>[0]) {}

  /** Download one object into the overlay once; concurrent reads share it. */
  fetch(key: string, meta: ObjectMetadata): Promise<void> {
    const pending = this.inflight.get(key);
    if (pending) return pending;
    const run = fetchObject(this.opts, this.budget, key, meta).finally(() =>
      this.inflight.delete(key),
    );
    this.inflight.set(key, run);
    return run;
  }

  /** Wait out a download of this key, whatever it ends up doing. */
  settle(key: string): Promise<void> | undefined {
    return this.inflight.get(key)?.catch(() => undefined);
  }

  /** Same, for every download landing under `prefix/` (a prefix delete). */
  async settleUnder(prefix: string): Promise<void> {
    for (const key of [...this.inflight.keys()]) {
      if (key.startsWith(`${prefix}/`)) await this.settle(key);
    }
  }
}
