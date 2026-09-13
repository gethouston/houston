// Plugging the product-analytics queue into the running app.
//
// The app already announces every meaningful action once, on the analytics bus,
// so this listens to that single stream rather than adding a second call at
// twenty sites — the same shape as the Academy's usage economy
// (`lib/academy/usage-live.ts`). React-free on purpose: the hook
// (`hooks/use-product-analytics-sink.ts`) gives it a life span, and a test
// gives it a fake bus.

import type { ProductAnalyticsQueue } from "./queue.ts";

export interface ProductAnalyticsSinkDeps {
  /**
   * Whether this client belongs to the managed cloud. A local desktop build
   * has no product-analytics gateway to ship to, so the sink must not even
   * become a listener there — it is not enough that its posts would fail.
   */
  hosted: boolean;
  queue: ProductAnalyticsQueue;
  /** The in-app analytics bus (`subscribeAnalytics`). */
  subscribe: (
    listener: (name: string, props?: Record<string, unknown>) => void,
  ) => () => void;
  /**
   * "The window is going away" (`onAppHidden`) — a quit, a cmd-tab away, a
   * backgrounded tab. The last notice anything buffered will ever get, since
   * React runs no cleanup when a window closes.
   */
  onHidden: (handler: () => void) => () => void;
}

/** Starts feeding the queue. Returns the way to stop; a no-op when not hosted. */
export function startProductAnalyticsSink(
  deps: ProductAnalyticsSinkDeps,
): () => void {
  if (!deps.hosted) return () => {};
  const unsubscribe = deps.subscribe((name, props) => {
    deps.queue.enqueue(name, props);
  });
  const stopWatchingForGoodbye = deps.onHidden(() => {
    void deps.queue.flush();
  });
  return () => {
    unsubscribe();
    stopWatchingForGoodbye();
  };
}
