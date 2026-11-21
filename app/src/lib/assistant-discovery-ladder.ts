import {
  assistantDiscoveryRetryDelayMs,
  shouldRetryAssistantDiscovery,
} from "./assistant-retry-schedule.ts";

export interface DiscoveryLadder<T> {
  ask: () => Promise<T>;
  surface: (err: unknown) => Promise<void>;
  signal?: AbortSignal;
}

export async function runDiscoveryLadder<T>(
  ladder: DiscoveryLadder<T>,
): Promise<T> {
  const { signal } = ladder;
  for (let failures = 0; ; failures += 1) {
    signal?.throwIfAborted();
    try {
      return await ladder.ask();
    } catch (err) {
      if (signal?.aborted) throw err;
      if (!shouldRetryAssistantDiscovery(failures, err)) {
        await ladder.surface(err);
        throw err;
      }
      await waitUnlessAborted(
        assistantDiscoveryRetryDelayMs(failures, err),
        signal,
      );
    }
  }
}

function waitUnlessAborted(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal?.addEventListener("abort", done, { once: true });
  });
}
