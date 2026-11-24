import { readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import type { HydrateManifest } from "./hydrate";
import { landedHash } from "./hydrate-attrs";
import { hydrateBatched, skipRefusedLanding } from "./hydrate-batch";
import { unowned } from "./hydrate-candidates";
import { landListedLinks, outsideLinks } from "./hydrate-links";
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
  link?: string;
  executable?: true;
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
  links: Set<string>;
}

/** Landed bytes counted against one cap. A deferring hydration keeps one for
 *  the critical set and one for the deferred files (hydrate.ts). */
export interface HydrateBudget {
  landed: number;
  readonly maxBytes: number;
}

export function hydrateDownloadState(
  controller: AbortController,
): HydrateDownloadState {
  return {
    failed: false,
    links: new Set(),
    fail(error) {
      if (this.failed) return;
      this.failed = true;
      this.firstError = error;
      controller.abort(error);
    },
  };
}

export class HydrateClaims {
  private readonly taken = new Set<string>();
  private readonly wanted = new Set<string>();

  constructor(private readonly onWanted?: (rel: string) => void) {}

  take(rel: string): boolean {
    if (this.taken.has(rel)) return false;
    this.taken.add(rel);
    return true;
  }

  want(rel: string): void {
    this.wanted.add(rel);
  }

  release(rel: string): void {
    this.taken.delete(rel);
    if (this.wanted.delete(rel)) this.onWanted?.(rel);
  }
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
  claims?: HydrateClaims;
  onSettled?: (rel: string) => void;
}): Promise<void> {
  // A store that batches reads lands most of the batch in a few round trips;
  // only what it will not inline (large objects) goes one by one below.
  const batched = opts.store.downloadMany?.bind(opts.store);
  const landedLinks = opts.state.links;
  const files = outsideLinks(opts.entries, landedLinks).filter(
    (entry) => entry.link === undefined,
  );
  const entries =
    batched && files.length > 1
      ? await hydrateBatched({ ...opts, entries: files, downloadMany: batched })
      : files;
  let next = 0;
  const worker = async () => {
    while (!opts.state.failed && opts.budget.landed <= opts.budget.maxBytes) {
      const entry = entries[next++];
      if (!entry) return;
      if (opts.claims && !opts.claims.take(entry.rel)) continue;
      const { generation, key, rel } = entry;
      try {
        const dest = join(opts.destDir, ...rel.split("/"));
        const read = await opts.store.download(key, dest, {
          signal: opts.signal,
        });
        if (opts.signal.aborted) return;
        if (read?.refused) {
          skipRefusedLanding(key);
          opts.onSettled?.(rel);
          continue;
        }
        const { size } = await stat(dest);
        opts.budget.landed += size;
        if (opts.budget.landed > opts.budget.maxBytes) {
          throw opts.limitError(opts.budget.landed);
        }
        if (!unowned(entry, read?.generation))
          opts.manifest.set(rel, {
            hash: await landedHash(dest, size, entry),
            generation: entry.fromRead ? read?.generation : generation,
            ...(opts.keepMergeBase && keepsMergeBase(rel)
              ? { mergeBase: await readFile(dest, "utf8") }
              : {}),
          });
        opts.onSettled?.(rel);
      } catch (error) {
        if (!opts.signal.aborted && error instanceof ObjectNotFoundError) {
          await rm(join(opts.destDir, ...rel.split("/")), { force: true });
          opts.onSettled?.(rel);
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
  await landListedLinks(
    opts.entries,
    opts.destDir,
    opts.manifest,
    opts.signal,
    landedLinks,
  );
}
