import { type HydrateCandidate, hydrateCandidates } from "./hydrate-candidates";
import { HydrateLimitError, listedBytes } from "./hydrate-limit";
import type {
  HydrateListedObject,
  HydrateListing,
  HydrateOptions,
} from "./hydrate-options";
import type { ObjectMetadata } from "./object-manifest";
import { StoreReadTimeoutError } from "./read-timeout";

type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown };

/** `promise`, or the signal's reason as soon as it aborts. */
function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  let onAbort: () => void = () => undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(signal.reason);
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  });
  return Promise.race([promise, aborted]).finally(() =>
    signal.removeEventListener("abort", onAbort),
  );
}

/**
 * Start the listing that lands while the critical set downloads, under the
 * hydration's signal and, given one, a deadline (StoreReadTimeoutError).
 * Settled at once, so a failure surfaces through `deferred` and never as an
 * unhandled rejection; an abort (the turn abandoned its files) settles it
 * without waiting for the store, so nothing that waits on `deferred` waits on
 * the listing.
 */
export function startLater(
  list: NonNullable<HydrateListing["later"]>,
  signal: AbortSignal,
  timeoutMs?: number,
): Promise<Settled<readonly ObjectMetadata[]>> {
  let bounded = signal;
  if (timeoutMs !== undefined) {
    const deadline = new AbortController();
    AbortSignal.timeout(timeoutMs).addEventListener(
      "abort",
      () => deadline.abort(new StoreReadTimeoutError(timeoutMs)),
      { once: true },
    );
    bounded = AbortSignal.any([signal, deadline.signal]);
  }
  return untilAborted(list(bounded), bounded).then(
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
