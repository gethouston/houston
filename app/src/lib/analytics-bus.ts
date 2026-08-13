// The IN-APP fan-out of analytics events.
//
// `analytics.track` reports to PostHog; this is how the app itself hears the
// same beat. The Academy's usage economy is the first listener: "the user did
// something worth points" is already expressed once, as an analytics event, and
// re-deriving it from a dozen call sites would guarantee the two drift apart.
//
// Deliberately dependency-free (analytics.ts drags in PostHog and the engine
// client, so it cannot be loaded outside a browser) and deliberately
// SYNCHRONOUS, so a listener sees the event in the same tick the user acted.

import type { AnalyticsEventName } from "./analytics";

export type AnalyticsListener = (
  name: AnalyticsEventName,
  props?: Record<string, unknown>,
) => void;

const listeners = new Set<AnalyticsListener>();

/** Listen to every tracked event. Returns the unsubscribe. */
export function subscribeAnalytics(listener: AnalyticsListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Fires every listener. Errors are contained per listener: analytics is a
 * side-channel, so a broken listener must never take down the user action that
 * emitted the event, nor stop the listeners after it. The snapshot means a
 * listener that unsubscribes (or subscribes) mid-fan-out cannot corrupt the walk.
 */
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
