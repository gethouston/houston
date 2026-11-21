import { readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileSha256 } from "./file-hash";
import type { HydrateManifest } from "./hydrate";
import { hydrateBatched, skipRefusedLanding } from "./hydrate-batch";
import { unowned } from "./hydrate-candidates";
import { ObjectNotFoundError, type ObjectStore } from "./object-store";
import { keepsMergeBase } from "./sync-back-doc-merge";

export interface HydrateEntry {
  generation?: string;
  key: string;
  rel: string;
  fromRead?: true;
  requireGeneration?: true;
}

const DEFAULT_HYDRATE_CONCURRENCY = 16;

export function hydrateConcurrency(requested?: number): number {
  const value = requested ?? DEFAULT_HYDRATE_CONCURRENCY;
  return Number.isFinite(value) && value >= 1
    ? Math.floor(value)
    : DEFAULT_HYDRATE_CONCURRENCY;
}

export interface HydrateDownloadState {
  failed: boolean;
  firstError?: unknown;
  fail: (error: unknown) => void;
}

export interface HydrateBudget {
  landed: number;
  readonly maxBytes: number;
}

export async function downloadHydrationEntries(opts: {
  store: Pick<ObjectStore, "download" | "downloadMany">;
  destDir: string;
  entries: HydrateEntry[];
  manifest: HydrateManifest;
  budget: HydrateBudget;
  concurrency: number;
  state: HydrateDownloadState;
  keepMergeBase?: boolean;
  signal: AbortSignal;
  limitError: (observedBytes: number) => Error;
  batchParallel?: number;
}): Promise<void> {
  const batched = opts.store.downloadMany?.bind(opts.store);
  const entries =
    batched && opts.entries.length > 1
      ? await hydrateBatched({ ...opts, downloadMany: batched })
      : opts.entries;
  let next = 0;
  const worker = async () => {
    while (!opts.state.failed && opts.budget.landed <= opts.budget.maxBytes) {
      const entry = entries[next++];
      if (!entry) return;
      const { generation, key, rel } = entry;
      try {
        const dest = join(opts.destDir, ...rel.split("/"));
        const read = await opts.store.download(key, dest, {
          signal: opts.signal,
        });
        if (opts.signal.aborted) return;
        if (read?.refused) {
          skipRefusedLanding(key);
          continue;
        }
        const { size } = await stat(dest);
        opts.budget.landed += size;
        if (opts.budget.landed > opts.budget.maxBytes) {
          throw opts.limitError(opts.budget.landed);
        }
        if (unowned(entry, read?.generation)) continue;
        opts.manifest.set(rel, {
          hash: await fileSha256(dest, size),
          generation: entry.fromRead ? read?.generation : generation,
          ...(opts.keepMergeBase && keepsMergeBase(rel)
            ? { mergeBase: await readFile(dest, "utf8") }
            : {}),
        });
      } catch (error) {
        if (!opts.signal.aborted && error instanceof ObjectNotFoundError) {
          await rm(join(opts.destDir, ...rel.split("/")), { force: true });
          continue;
        }
        opts.state.fail(error);
        return;
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(opts.concurrency, entries.length) }, worker),
  );
  if (opts.state.failed) throw opts.state.firstError;
}
