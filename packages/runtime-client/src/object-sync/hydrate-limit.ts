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

export function listedBytes(
  entries: readonly { rel: string }[],
  sizes: ReadonlyMap<string, number>,
): number {
  let listed = 0;
  for (const { rel } of entries) listed += sizes.get(rel) ?? 0;
  return listed;
}

export function assertListedWithinCap(
  entries: readonly { rel: string }[],
  sizes: ReadonlyMap<string, number>,
  maxBytes: number,
): void {
  const listed = listedBytes(entries, sizes);
  if (listed > maxBytes) throw new HydrateLimitError(maxBytes, listed);
}

export function splitDeferred<T extends { rel: string }>(opts: {
  critical: readonly T[];
  remaining: T[];
  defer?: (rel: string) => boolean;
  sizes: ReadonlyMap<string, number>;
  maxBytes: number;
  deferredMaxBytes: number;
  capListed?: boolean;
}): { now: T[]; later: T[]; deferredRefusal?: HydrateLimitError } {
  const defer = opts.defer;
  const later = defer ? opts.remaining.filter(({ rel }) => defer(rel)) : [];
  const now = later.length
    ? opts.remaining.filter(({ rel }) => !defer?.(rel))
    : opts.remaining;
  if (later.length || opts.capListed)
    assertListedWithinCap(
      [...opts.critical, ...now],
      opts.sizes,
      opts.maxBytes,
    );
  const laterListed = listedBytes(later, opts.sizes);
  return laterListed > opts.deferredMaxBytes
    ? {
        now,
        later,
        deferredRefusal: new HydrateLimitError(
          opts.deferredMaxBytes,
          laterListed,
        ),
      }
    : { now, later };
}
