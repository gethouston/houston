/**
 * What the web tree starts on the analytics side at boot, and in which order.
 * Both mounts render nothing and sit at the top of the tree (`app-tree.tsx`),
 * above every gate and outside `<App/>` — which is keyed by identity and
 * remounts on every sign-in, so one instance there would pay each event twice.
 *
 * The desktop counterpart is `StartupEffects` in app/src/main.tsx.
 */

import { useProductAnalyticsSink } from "@houston/app/hooks/use-product-analytics-sink";
import { analytics } from "@houston/app/lib/analytics";
import { createWebSessionStart } from "@houston/app/lib/web-session-start";
import { readWebVisitorId } from "@houston/app/lib/web-visitor-landing";
import { useEffect } from "react";

/**
 * The first-party product-analytics pipe, listening on the same bus as the
 * usage economy with the same whole-page life span. It reads the session
 * through a query, so it must sit INSIDE QueryClientProvider.
 */
export function ProductAnalyticsSinkMount() {
  useProductAnalyticsSink();
  return null;
}

// The launch itself, which on desktop is `runStartupAnalytics`'s last act
// (app/src/lib/startup-analytics.ts) and belongs to an install identity this
// surface has no equivalent of. The rule it carries is in
// `web-session-start.ts`; this is only the wiring. Built at module load, so a
// remount is still one launch.
const startWebSession = createWebSessionStart({
  track: (name) => analytics.track(name),
  captureVisitor: readWebVisitorId,
});

/**
 * Mounted AFTER the sink, so the sink is already listening on the bus when the
 * beat goes out: sibling effects run in render order, and an event announced to
 * nobody is simply gone.
 */
export function WebSessionStartMount() {
  useEffect(startWebSession, []);
  return null;
}
