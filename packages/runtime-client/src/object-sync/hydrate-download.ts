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
  /** Not listed: read by key, and owned at the generation of that read. */
  fromRead?: true;
  /** A point read in a store whose listing carries generations: owned only
   *  when the read names one (hydrate-candidates.ts `unowned`). */
  requireGeneration?: true;
}

const DEFAULT_HYDRATE_CONCURRENCY = 16;

/** Downloads in flight, guarding against a non-finite override: NaN sizes
 *  the worker array to ZERO, which would return a successful empty manifest
 *  for a non-empty store, the exact partial-manifest state the hydration
 *  latch exists to prevent. */
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

/** Landed bytes counted against one cap. A deferring hydration keeps one for
 *  the critical set and one for the deferred files (hydrate.ts). */
export interface HydrateBudget {
  landed: number;
  readonly maxBytes: number;
}

/** Download one hydration batch while sharing a budget and the failure latch. */
export async function downloadHydrationEntries(opts: {
  store: Pick<ObjectStore, "download" | "downloadMany">;
  destDir: string;
  entries: HydrateEntry[];
  manifest: HydrateManifest;
  budget: HydrateBudget;
  concurrency: number;
  state: HydrateDownloadState;
  /** Keep the board's bytes as its merge base (worker stores only). */
  keepMergeBase?: boolean;
  signal: AbortSignal;
  limitError: (observedBytes: number) => Error;
  /** Batched reads in flight at once (hydrate-batch.ts default otherwise). */
  batchParallel?: number;
}): Promise<void> {
  // A store that batches reads lands most of the batch in a few round trips;
  // only what it will not inline (large objects) goes one by one below.
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
