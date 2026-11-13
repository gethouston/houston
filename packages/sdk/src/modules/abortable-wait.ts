import type { Clock } from "../ports";

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Request aborted", "AbortError");
}

export function waitForRetry(
  clock: Clock,
  ms: number,
  signal?: AbortSignal,
): Promise<void> {
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const abort = () => {
      clock.clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(new DOMException("Request aborted", "AbortError"));
    };
    const timer = clock.setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
  });
}
