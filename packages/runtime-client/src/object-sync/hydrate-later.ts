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
