import { type HydrateCandidate, hydrateCandidates } from "./hydrate-candidates";
import { HydrateLimitError, listedBytes } from "./hydrate-limit";
import type { HydrateListedObject, HydrateOptions } from "./hydrate-options";
import type { ObjectMetadata } from "./object-manifest";

type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown };

/** Observe a listing that lands while the critical set downloads, so its
 *  failure surfaces through `deferred` and never as an unhandled rejection
 *  before `done` gets there. */
export function settleLater(
  listing: Promise<readonly ObjectMetadata[]>,
): Promise<Settled<readonly ObjectMetadata[]>> {
  return listing.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
}

/**
 * The later listing's admitted objects, every one deferred. They share the
 * deferred budget with the deferred objects of the first listing, checked
 * from the listed sizes before any of them downloads.
 */
export function admitLater(
  settled: Settled<readonly ObjectMetadata[]>,
  opts: {
    prefix: string;
    excludes: string[];
    sizes: Map<string, number>;
    filter?: HydrateOptions["filter"];
    filterListing: readonly HydrateListedObject[];
    destDir: string;
    deferredMaxBytes: number;
    later: readonly HydrateCandidate[];
  },
): HydrateCandidate[] {
  if (!settled.ok) throw settled.error;
  const { candidates } = hydrateCandidates({
    objects: settled.value,
    prefix: opts.prefix,
    excludes: opts.excludes,
    sizes: opts.sizes,
  });
  const admitted = opts.filter
    ? candidates.filter(({ rel }) =>
        opts.filter?.(rel, opts.filterListing, opts.destDir),
      )
    : candidates;
  const bytes = listedBytes([...opts.later, ...admitted], opts.sizes);
  if (bytes > opts.deferredMaxBytes)
    throw new HydrateLimitError(opts.deferredMaxBytes, bytes);
  return admitted;
}
