/**
 * Bounded-concurrency pool for the cloud-migration run (HOU-719).
 *
 * Agents migrate independently: a failed or slow agent never blocks the
 * others, so one wedged pod can't stall the whole install. The cap keeps a
 * big install from stampeding the gateway (every agent provisions its own
 * pod) and from saturating the user's uplink with parallel zip uploads —
 * which is what made single uploads fragile in the first place.
 *
 * `run` must settle each item's outcome itself (the store parks failures in
 * the per-row error state); a rejection here would kill one worker and skew
 * the pool, so it is treated as a programming error and propagated.
 *
 * Dependency-free so `node --test` exercises it directly
 * (see `app/tests/cloud-migration-pool.test.ts`).
 */

export const MIGRATION_CONCURRENCY = 3;

export async function runWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  run: (item: T) => Promise<void>,
  /** Checked before each pickup — a true stops workers taking NEW items;
   *  items already in flight finish (the "Migrate later" contract). */
  shouldStop: () => boolean = () => false,
): Promise<void> {
  const queue = [...items];
  const width = Math.max(1, Math.min(limit, queue.length));
  const workers = Array.from({ length: width }, async () => {
    while (queue.length > 0 && !shouldStop()) {
      const item = queue.shift();
      if (item === undefined) return;
      await run(item);
    }
  });
  await Promise.all(workers);
}
