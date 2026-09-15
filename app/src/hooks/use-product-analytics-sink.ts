import { useEffect, useRef } from "react";
import { subscribeAnalytics } from "../lib/analytics";
import { onAppHidden } from "../lib/app-hidden";
import { reportError } from "../lib/error-report";
import type { ProductAnalyticsLoss } from "../lib/product-analytics/queue";
import { ProductAnalyticsQueue } from "../lib/product-analytics/queue";
import { startProductAnalyticsSink } from "../lib/product-analytics/sink";
import { sendProductEvents } from "../lib/product-analytics/transport";
import { currentClientDeployment } from "../lib/sentry-deployment";
import { useSession } from "./use-session";

/**
 * Feeds the first-party product-analytics pipe for the whole life of the app.
 * What is gathered and what is dropped is the catalogue's decision
 * (`lib/product-analytics/catalogue.ts`); the sink itself is in
 * `lib/product-analytics/sink.ts`.
 *
 * The gate is the deployment, decided at mount from build-time flags (nothing
 * to wait for): only a managed-cloud client has a gateway that accepts these
 * events, so a local desktop build never becomes a listener at all.
 *
 * Mounted ONCE per surface, ABOVE every gate — the desktop entry's
 * `StartupEffects` (app/src/main.tsx) and the web tree's root
 * (packages/web/src/app-tree.tsx) — never inside `<App/>`, which is keyed by
 * identity and remounts on every sign-in. A second live instance would send
 * every event twice.
 */
/**
 * Events that never made it are silent to the user and must never be silent to
 * us. One report per class per launch: each is a fact about the deployment (the
 * route and this client disagree, a backlog overflowed, the transport threw),
 * so a per-event report would file the same issue hundreds of times.
 */
const reportedLosses = new Set<ProductAnalyticsLoss>();
function reportProductAnalyticsLoss(
  reason: ProductAnalyticsLoss,
  detail: unknown,
): void {
  if (reportedLosses.has(reason)) return;
  reportedLosses.add(reason);
  reportError("product-analytics", `events were lost (${reason})`, detail);
}

export function useProductAnalyticsSink(): void {
  const { data: session } = useSession();
  const queueRef = useRef<ProductAnalyticsQueue | null>(null);

  useEffect(() => {
    const queue = new ProductAnalyticsQueue({
      transport: sendProductEvents,
      onLost: reportProductAnalyticsLoss,
    });
    queueRef.current = queue;
    return startProductAnalyticsSink({
      hosted: currentClientDeployment() === "managed-cloud",
      queue,
      subscribe: subscribeAnalytics,
      onHidden: onAppHidden,
    });
  }, []);

  // The queue holds events minted before a session existed (`session_started`
  // routinely beats the async session load, and dropping it would under-count
  // exactly the launch we care about). Drain them the moment a bearer exists.
  const token = session?.idToken ?? null;
  useEffect(() => {
    if (token) void queueRef.current?.flush();
  }, [token]);
}
