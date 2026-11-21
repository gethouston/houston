import type { AnalyticsEventName } from "../analytics-vocabulary.ts";
import type { ProductAnalyticsQueue } from "./queue.ts";

export interface ProductAnalyticsSinkDeps {
  hosted: boolean;
  queue: ProductAnalyticsQueue;
  subscribe: (
    listener: (
      name: AnalyticsEventName,
      props?: Record<string, unknown>,
    ) => void,
  ) => () => void;
  onHidden: (handler: () => void) => () => void;
}

export function startProductAnalyticsSink(
  deps: ProductAnalyticsSinkDeps,
): () => void {
  if (!deps.hosted) return () => {};
  const unsubscribe = deps.subscribe((name, props) => {
    deps.queue.enqueue(name, props);
  });
  const stopWatchingForGoodbye = deps.onHidden(() => {
    void deps.queue.flush({ final: true });
  });
  return () => {
    unsubscribe();
    stopWatchingForGoodbye();
  };
}
