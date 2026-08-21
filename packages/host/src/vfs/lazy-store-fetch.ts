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
