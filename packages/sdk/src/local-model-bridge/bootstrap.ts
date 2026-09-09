import { bridgeRetry } from "./retry";

/** The identity of a failure for report deduping: its message, else its text. */
function failureKey(error: unknown): string {
  return error instanceof Error
    ? `${error.name}:${error.message}`
    : String(error);
}

/**
 * Retry only discovery/port construction. The factory must never start
 * inference or a bridge. A failing streak is reported ONCE, when it starts
 * and whenever its cause changes: the retry loop runs every few seconds for
 * as long as the app is open, and reporting every attempt turned one
 * unreachable server into hundreds of identical events per desktop.
 */
export async function bootstrapLocalModelBridge<T>(
  factory: (signal: AbortSignal) => Promise<T | null>,
  signal: AbortSignal,
  options: { report(error: unknown): void; random?: () => number },
): Promise<T | null> {
  let attempt = 0;
  let reported: string | undefined;
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
      const key = failureKey(error);
      if (key !== reported) {
        reported = key;
        options.report(error);
      }
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
