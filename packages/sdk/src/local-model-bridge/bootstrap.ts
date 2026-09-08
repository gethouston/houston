import { bridgeRetry } from "./retry";

/** Retry only discovery/port construction. The factory must never start inference or a bridge. */
export async function bootstrapLocalModelBridge<T>(
  factory: (signal: AbortSignal) => Promise<T | null>,
  signal: AbortSignal,
  options: { report(error: unknown): void; random?: () => number },
): Promise<T | null> {
  let attempt = 0;
  for (;;) {
    signal.throwIfAborted();
    try {
      const result = await factory(signal);
      signal.throwIfAborted();
      return result;
    } catch (error) {
      signal.throwIfAborted();
      const { delay } = bridgeRetry(
        error,
        attempt++,
        options.random ?? Math.random,
      );
      if (delay === null) throw error;
      options.report(error);
      signal.throwIfAborted();
      await new Promise<void>((resolve, reject) => {
        const abort = () => {
          clearTimeout(timer);
          reject(signal.reason);
        };
        const timer = setTimeout(() => {
          signal.removeEventListener("abort", abort);
          resolve();
        }, delay);
        signal.addEventListener("abort", abort, { once: true });
      });
    }
  }
}
