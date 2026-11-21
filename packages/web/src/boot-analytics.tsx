import { useProductAnalyticsSink } from "@houston/app/hooks/use-product-analytics-sink";
import { analytics } from "@houston/app/lib/analytics";
import { createWebSessionStart } from "@houston/app/lib/web-session-start";
import { readWebVisitorId } from "@houston/app/lib/web-visitor-landing";
import { useEffect } from "react";

export function ProductAnalyticsSinkMount() {
  useProductAnalyticsSink();
  return null;
}

const startWebSession = createWebSessionStart({
  track: (name) => analytics.track(name),
  captureVisitor: readWebVisitorId,
});

export function WebSessionStartMount() {
  useEffect(startWebSession, []);
  return null;
}
