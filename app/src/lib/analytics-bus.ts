import type { AnalyticsEventName } from "./analytics-vocabulary";

export type AnalyticsListener = (
  name: AnalyticsEventName,
  props?: Record<string, unknown>,
) => void;

const listeners = new Set<AnalyticsListener>();

export function subscribeAnalytics(listener: AnalyticsListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyAnalytics(
  name: AnalyticsEventName,
  props?: Record<string, unknown>,
): void {
  for (const listener of [...listeners]) {
    try {
      listener(name, props);
    } catch (e) {
      console.error("[analytics] listener failed", name, e);
    }
  }
}
