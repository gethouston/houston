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
