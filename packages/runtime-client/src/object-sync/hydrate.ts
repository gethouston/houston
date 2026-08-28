import {
  downloadHydrationEntries,
  type HydrateDownloadState,
  type HydrateEntry,
} from "./hydrate-download";
import { DEFAULT_EXCLUDES, excluded } from "./hydrate-excludes";
import type { ObjectStore } from "./object-store";

export { DEFAULT_EXCLUDES, excluded } from "./hydrate-excludes";

/**
 * Durable engine state is materialized into a local cache, then synchronized
 * back by content hash. The hydration manifest is the ownership boundary: only
 * objects observed on hydrate may be interpreted as locally deleted later.
 * Authentication material and temporary files never cross this boundary.
 */

export interface HydrateManifestEntry {
  hash: string;
  generation?: string;
}

/** Relative path to the hydrated bytes and their optional remote generation. */
export type HydrateManifest = Map<string, HydrateManifestEntry>;

export interface HydrateOptions {
  /** Reject prefixes whose total size exceeds this (default 512 MiB). */
  maxBytes?: number;
  excludes?: string[];
  /**
   * Concurrent downloads (default 16). Hydration gates the managed pod's
   * readiness, and one store round-trip per object (~80 ms through the pod
   * store) dominates cold wake time when it runs sequentially: a routine
   * 133-object workspace measured 10.5 s sequential vs 0.4 s at 16.
   */
  concurrency?: number;
  /** Admit objects after priorities land using the listing and hydrated root. */
  filter?: (
    rel: string,
    listing: readonly HydrateListedObject[],
    hydratedRoot: string,
  ) => boolean;
  /** Every non-excluded path before `filter` (the store's view of the tree) and
   *  whether the listing carried generations (the CAS capability, which a
   *  filtered manifest can no longer answer on its own). */
  onListed?: (listing: {
    rels: string[];
    generationAware: boolean;
  }) => void | Promise<void>;
  /** Download these candidates before filtering the non-priority objects. */
  priority?: (rel: string) => boolean;
}

/** Store-listing fields available to a caller's hot-set selector. */
export interface HydrateListedObject {
  rel: string;
  updated?: string;
}

/** The hydrated prefix exceeded the caller's aggregate byte cap. */
export class HydrateLimitError extends Error {
  constructor(
    readonly maxBytes: number,
    readonly observedBytes: number,
  ) {
    super(
      `workspace exceeds the ${Math.round(maxBytes / 1024 / 1024)} MiB hydration limit`,
    );
    this.name = "HydrateLimitError";
  }
}

const DEFAULT_HYDRATE_CONCURRENCY = 16;

export interface StartedHydration {
  manifest: HydrateManifest;
  listed: { rels: string[]; generationAware: boolean };
  /** Listed objects rejected by the caller's filter. */
  skippedObjects: number;
  /** Resolves only after every non-priority object has landed. */
  done: Promise<void>;
  /** Stop admitting downloads and cancel adapters that support AbortSignal. */
  abort: () => void;
}

/** List once, hydrate priority inputs, then start the remaining downloads. */
export async function startHydrate(
  store: ObjectStore,
  prefix: string,
  destDir: string,
  opts: HydrateOptions = {},
): Promise<StartedHydration> {
  const excludes = opts.excludes ?? DEFAULT_EXCLUDES;
  const maxBytes = opts.maxBytes ?? 512 * 1024 * 1024;
  // Guard against a non-finite override (NaN sizes the worker array to ZERO,
  // which would return a successful empty manifest for a non-empty store —
  // the exact partial-manifest state the hydration latch exists to prevent).
  const requested = opts.concurrency ?? DEFAULT_HYDRATE_CONCURRENCY;
  const concurrency =
    Number.isFinite(requested) && requested >= 1
      ? Math.floor(requested)
      : DEFAULT_HYDRATE_CONCURRENCY;
  const manifest: HydrateManifest = new Map();
  const objects = store.manifest ? await store.manifest(prefix) : undefined;
  const storeObjects =
    objects ??
    (await store.list(prefix)).map((key) => ({ key, generation: undefined }));
  const candidates: (HydrateEntry & { updated?: string })[] = [];
  let generationAware = false;
  for (const object of storeObjects) {
    const { key } = object;
    const rel = prefix ? key.slice(prefix.length + 1) : key;
    if (!rel || excluded(rel, excludes)) continue;
    if (object.generation !== undefined) generationAware = true;
    candidates.push({
      key,
      rel,
      generation: object.generation,
      ...("updated" in object && object.updated
        ? { updated: object.updated }
        : {}),
    });
  }
  const filterListing = candidates.map(({ rel, updated }) => ({
    rel,
    ...(updated ? { updated } : {}),
  }));
  const listed = {
    rels: candidates.map(({ rel }) => rel),
    generationAware,
  };
  await opts.onListed?.(listed);
  const priorityCandidates = opts.priority
    ? candidates.filter((entry) => opts.priority?.(entry.rel))
    : [];
  const priorityRels = new Set(priorityCandidates.map(({ rel }) => rel));
  const controller = new AbortController();
  const state: HydrateDownloadState = {
    total: 0,
    failed: false,
    fail(error) {
      if (this.failed) return;
      this.failed = true;
      this.firstError = error;
      controller.abort(error);
    },
  };
  const download = (batch: HydrateEntry[]) =>
    downloadHydrationEntries({
      store,
      destDir,
      entries: batch,
      manifest,
      maxBytes,
      concurrency,
      state,
      signal: controller.signal,
      limitError: (observedBytes) =>
        new HydrateLimitError(maxBytes, observedBytes),
    });
  const filter = opts.filter;
  const priority = filter
    ? priorityCandidates.filter((entry) =>
        filter(entry.rel, filterListing, destDir),
      )
    : priorityCandidates;
  await download(priority);
  const remainingCandidates = candidates.filter(
    ({ rel }) => !priorityRels.has(rel),
  );
  const remaining = filter
    ? remainingCandidates.filter((entry) =>
        filter(entry.rel, filterListing, destDir),
      )
    : remainingCandidates;
  return {
    manifest,
    listed,
    skippedObjects: candidates.length - priority.length - remaining.length,
    done: download(remaining),
    abort: () => state.fail(new Error("hydration aborted before cleanup")),
  };
}

/** Download everything under `prefix` into `destDir`. Returns the manifest. */
export async function hydrate(
  store: ObjectStore,
  prefix: string,
  destDir: string,
  opts: HydrateOptions = {},
): Promise<HydrateManifest> {
  const started = await startHydrate(store, prefix, destDir, opts);
  await started.done;
  return started.manifest;
}

export type { SyncBackOptions, SyncResult } from "./sync-back";
export { syncBack } from "./sync-back";
