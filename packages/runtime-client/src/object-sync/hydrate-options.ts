export interface HydrateManifestEntry {
  hash: string;
  generation?: string;
  /** Observed bytes of a three-way-merged doc; trusted only if sha256 = hash. */
  mergeBase?: string;
}

/** Relative path to the hydrated bytes and their optional remote generation. */
export type HydrateManifest = Map<string, HydrateManifestEntry>;

/** Store-listing fields available to a caller's hot-set selector. */
export interface HydrateListedObject {
  rel: string;
  updated?: string;
}

export interface StartedHydration {
  manifest: HydrateManifest;
  listed: { rels: string[]; generationAware: boolean };
  /** Listed objects rejected by the caller's filter. */
  skippedObjects: number;
  /** Resolves only after every non-priority, non-deferred object has landed. */
  done: Promise<void>;
  /** Resolves after `done` and every `opts.defer` object has landed. */
  deferred: Promise<void>;
  /** Stop admitting downloads and cancel adapters that support AbortSignal.
   *  `reason` becomes the rejection of whatever has not landed yet. */
  abort: (reason?: unknown) => void;
}

/** A listing the caller made itself, in place of listing the prefix whole. */
export interface HydrateListing {
  /** Listed objects, keys as the store names them. */
  objects: readonly import("./object-manifest").ObjectMetadata[];
  /** Keys read without a listing entry: landed at the generation of the
   *  read when present, left out (and so unowned) when absent. */
  reads?: readonly string[];
  /** Objects listed while the rest downloads. Every admitted one is
   *  deferred (`defer`, `deferredMaxBytes`); a failed listing fails
   *  `deferred`, never `done`. */
  later?: Promise<readonly import("./object-manifest").ObjectMetadata[]>;
}

/** Caller policy for one hydration. */
export interface HydrateOptions {
  /** Hydrate from this listing instead of listing the prefix whole. The
   *  manifest then owns only what it names: an object it leaves out is
   *  never downloaded, so sync-back never deletes it. */
  listing?: HydrateListing;
  /** Reject prefixes whose critical (non-deferred) bytes exceed this
   *  (default 512 MiB). */
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
  /**
   * Admitted objects kept out of `done`: they start downloading once `done`
   * resolves and land in `deferred`. A caller that defers must observe
   * `deferred`, or its rejection goes unhandled.
   */
  defer?: (rel: string) => boolean;
  /**
   * Deferred objects only: their own byte budget, apart from `maxBytes`
   * (default: `maxBytes`). Over it from the listing, `deferred` rejects with
   * HydrateLimitError before any deferred download starts and `done` is
   * unaffected; unsized objects are bounded as they land.
   */
  deferredMaxBytes?: number;
  /**
   * Deferred objects only: one store read (an object, or a batch) gives up
   * after this long plus time for its listed bytes (read-timeout.ts),
   * failing `deferred` instead of hanging whoever waits on it. Absent = no
   * deadline, like the critical set.
   */
  deferredReadTimeoutMs?: number;
  /**
   * Deferred objects only: store reads in flight at once, batched or not
   * (default: the critical set's). They download beside whatever the caller
   * started on `done`, so a lower cap bounds the buffered batch bytes.
   */
  deferredParallel?: number;
  /**
   * Keep the board's hydrated bytes in the manifest as its three-way merge
   * base (`SyncBackOptions.workerMerge`). Off for the standing store sync.
   */
  keepMergeBase?: boolean;
  /**
   * Refuse with HydrateLimitError when the admitted objects' listed sizes
   * pass `maxBytes`, before the non-priority downloads start (a deferring
   * hydration always does). For a caller whose refusal is certain from the
   * listing and whose download would otherwise run up to the cap first.
   */
  capListed?: boolean;
}
