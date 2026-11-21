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

  const token = session?.idToken ?? null;
  useEffect(() => {
    if (token) void queueRef.current?.flush();
  }, [token]);
}
