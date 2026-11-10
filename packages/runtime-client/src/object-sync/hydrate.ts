import { hydrateCandidates, listWhole } from "./hydrate-candidates";
import {
  downloadHydrationEntries,
  type HydrateBudget,
  type HydrateDownloadState,
  type HydrateEntry,
  hydrateConcurrency,
} from "./hydrate-download";
import { DEFAULT_EXCLUDES } from "./hydrate-excludes";
import { admitLater, startLater } from "./hydrate-later";
import { HydrateLimitError, splitDeferred } from "./hydrate-limit";
import type { ObjectStore } from "./object-store";
import { withReadTimeout } from "./read-timeout";

export {
  DEFAULT_EXCLUDES,
  excluded,
  STORE_ROOT_PACKAGE_EXCLUDES,
} from "./hydrate-excludes";
export { HydrateLimitError } from "./hydrate-limit";

/**
 * Durable engine state is materialized into a local cache, then synchronized
 * back by content hash. The hydration manifest is the ownership boundary: only
 * objects observed on hydrate may be interpreted as locally deleted later.
 * Authentication material and temporary files never cross this boundary.
 */

import type {
  HydrateManifest,
  HydrateOptions,
  StartedHydration,
} from "./hydrate-options";

export type {
  HydrateListedObject,
  HydrateListing,
  HydrateManifest,
  HydrateManifestEntry,
  HydrateOptions,
  StartedHydration,
} from "./hydrate-options";

/** List once, hydrate priority inputs, then start the remaining downloads. */
export async function startHydrate(
  store: ObjectStore,
  prefix: string,
  destDir: string,
  opts: HydrateOptions = {},
): Promise<StartedHydration> {
  const excludes = opts.excludes ?? DEFAULT_EXCLUDES;
  const maxBytes = opts.maxBytes ?? 512 * 1024 * 1024;
  const concurrency = hydrateConcurrency(opts.concurrency);
  const controller = new AbortController();
  const listedLater = opts.listing?.later
    ? startLater(
        opts.listing.later,
        controller.signal,
        opts.deferredReadTimeoutMs,
      )
    : undefined;
  const manifest: HydrateManifest = new Map();
  const { candidates, sizes, generationAware } = hydrateCandidates({
    objects: opts.listing?.objects ?? (await listWhole(store, prefix)),
    ...(opts.listing?.reads ? { reads: opts.listing.reads } : {}),
    prefix,
    excludes,
  });
  const listedCandidates = candidates.filter(({ fromRead }) => !fromRead);
  const filterListing = listedCandidates.map(({ rel, updated }) => ({
    rel,
    ...(updated ? { updated } : {}),
  }));
  const listed = {
    rels: listedCandidates.map(({ rel }) => rel),
    generationAware,
  };
  await opts.onListed?.(listed);
  const priorityCandidates = opts.priority
    ? candidates.filter((entry) => opts.priority?.(entry.rel))
    : [];
  const priorityRels = new Set(priorityCandidates.map(({ rel }) => rel));
  const state: HydrateDownloadState = {
    failed: false,
    fail(error) {
      if (this.failed) return;
      this.failed = true;
      this.firstError = error;
      controller.abort(error);
    },
  };
  const critical: HydrateBudget = { landed: 0, maxBytes };
  const deferredBudget: HydrateBudget = {
    landed: 0,
    maxBytes: opts.deferredMaxBytes ?? maxBytes,
  };
  const download = (batch: HydrateEntry[], later = false) =>
    downloadHydrationEntries({
      store:
        later && opts.deferredReadTimeoutMs !== undefined
          ? withReadTimeout(store, opts.deferredReadTimeoutMs, (key) =>
              sizes.get(prefix ? key.slice(prefix.length + 1) : key),
            )
          : store,
      destDir,
      entries: batch,
      manifest,
      budget: later ? deferredBudget : critical,
      concurrency: (later && opts.deferredParallel) || concurrency,
      ...(later && opts.deferredParallel
        ? { batchParallel: opts.deferredParallel }
        : {}),
      state,
      keepMergeBase: opts.keepMergeBase === true,
      signal: controller.signal,
      limitError: (observedBytes) =>
        new HydrateLimitError(
          later ? deferredBudget.maxBytes : maxBytes,
          observedBytes,
        ),
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
  const { now, later, deferredRefusal } = splitDeferred({
    critical: priority,
    remaining,
    sizes,
    maxBytes,
    deferredMaxBytes: deferredBudget.maxBytes,
    ...(opts.defer ? { defer: opts.defer } : {}),
    ...(opts.capListed ? { capListed: true } : {}),
  });
  const done = download(now);
  const downloadLater = async () => {
    if (deferredRefusal) throw deferredRefusal;
    const extra = listedLater
      ? admitLater(await listedLater, {
          prefix,
          excludes,
          sizes,
          filterListing,
          destDir,
          ...(filter ? { filter } : {}),
          deferredMaxBytes: deferredBudget.maxBytes,
          later,
        })
      : [];
    return download([...later, ...extra], true);
  };
  return {
    manifest,
    listed,
    skippedObjects: candidates.length - priority.length - remaining.length,
    done,
    // After `done`, so a deferred object never takes bandwidth from the set
    // the caller is blocked on.
    deferred: later.length || listedLater ? done.then(downloadLater) : done,
    abort: (reason) =>
      state.fail(reason ?? new Error("hydration aborted before cleanup")),
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
  await started.deferred;
  return started.manifest;
}

export type {
  LocalWriteLock,
  SyncBackOptions,
  SyncMerge,
  SyncResult,
} from "./sync-back";
export { syncBack } from "./sync-back";
