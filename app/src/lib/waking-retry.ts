export interface WakingRetryDeps {
  isWaking: (err: unknown) => boolean;
  sleep: (ms: number) => Promise<void>;
  onRetry?: (err: unknown, delayMs: number) => void;
}

export async function retryWhileWaking<T>(
  attempt: () => Promise<T>,
  delaysMs: readonly number[],
  deps: WakingRetryDeps,
): Promise<T> {
  let last: unknown;
  try {
    return await attempt();
  } catch (e) {
    last = e;
  }
  for (const delayMs of delaysMs) {
    if (!deps.isWaking(last)) throw last;
    deps.onRetry?.(last, delayMs);
    await deps.sleep(delayMs);
    try {
      return await attempt();
    } catch (e) {
      last = e;
    }
  }
  throw last;
}
