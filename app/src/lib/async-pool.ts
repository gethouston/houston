/**
 * Run `task` over `items` with at most `limit` of them in flight at a time,
 * resolving once every started task has settled.
 *
 * Nothing is batched: `task` commits its own result as it settles, so a caller
 * can stream results into the UI instead of waiting for the slowest one (the
 * mission-search transcript scan used to `Promise.allSettled` the whole board
 * and paint once at the end — HOU-941).
 *
 * `shouldStop` is consulted before each start, so a superseded run stops
 * launching work rather than finishing a wave nobody is waiting for any more.
 * Tasks already in flight are not interrupted; a caller that must discard their
 * results checks its own generation inside `task`.
 *
 * `task` MUST NOT reject — it owns its own error handling (a rejection would
 * take its worker down and leave the remaining items unprocessed).
 */
export async function runPool<T>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<void>,
  shouldStop: () => boolean = () => false,
): Promise<void> {
  let next = 0;
  const workers = Math.max(1, Math.min(limit, items.length));
  await Promise.all(
    Array.from({ length: workers }, async () => {
      while (next < items.length) {
        if (shouldStop()) return;
        await task(items[next++]);
      }
    }),
  );
}
