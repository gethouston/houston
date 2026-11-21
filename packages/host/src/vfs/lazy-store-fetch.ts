import { mkdir, readFile, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  fileSha256,
  keepsMergeBase,
  type ObjectMetadata,
} from "@houston/runtime-client/object-sync";
import {
  LazyReadRefusedError,
  type LazyStoreVfsOptions,
} from "./lazy-store-types";

export interface LazyBudget {
  materializedBytes: number;
}

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
    const storeKey = opts.prefix ? `${opts.prefix}/${key}` : key;
    const read = opts.store.downloadVersioned
      ? await opts.store.downloadVersioned(storeKey, dest)
      : await opts.store.download(storeKey, dest);
    if (read?.refused) {
      throw new LazyReadRefusedError("private", key, meta.size, maxObjectBytes);
    }
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
      ...(keepsMergeBase(key) &&
      read?.generation !== undefined &&
      read.generation === meta.generation
        ? { mergeBase: await readFile(dest, "utf8") }
        : {}),
    });
    budget.materializedBytes += size;
  } catch (error) {
    await rm(dest, { force: true });
    throw error;
  }
}

export class Materializer {
  private readonly inflight = new Map<string, Promise<void>>();
  private readonly budget: LazyBudget = { materializedBytes: 0 };

  constructor(private readonly opts: Parameters<typeof fetchObject>[0]) {}

  fetch(key: string, meta: ObjectMetadata): Promise<void> {
    const pending = this.inflight.get(key);
    if (pending) return pending;
    const run = fetchObject(this.opts, this.budget, key, meta).finally(() =>
      this.inflight.delete(key),
    );
    this.inflight.set(key, run);
    return run;
  }

  settle(key: string): Promise<void> | undefined {
    return this.inflight.get(key)?.catch(() => undefined);
  }

  async settleUnder(prefix: string): Promise<void> {
    for (const key of [...this.inflight.keys()]) {
      if (key.startsWith(`${prefix}/`)) await this.settle(key);
    }
  }
}
