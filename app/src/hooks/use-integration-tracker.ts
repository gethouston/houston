import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../lib/query-keys";
import { analytics } from "../lib/analytics";

/**
 * Watches the cached `connectedToolkits` array and fires
 * `integration_disconnected` for any slug that drops out between snapshots.
 *
 * Composio integrations don't have a UI "Disconnect" button in Houston —
 * disconnections happen via the Composio CLI directly or via auth expiry.
 * The frontend learns about them via the polling diff on the
 * `connectedToolkits` query.
 *
 * Mount ONCE in App.tsx alongside `useAnalyticsSubscriber`. Multiple mounts
 * would over-count.
 */
export function useIntegrationTracker() {
  const qc = useQueryClient();
  const previousRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    // Subscribe to cache changes for the connectedToolkits query
    const unsubscribe = qc.getQueryCache().subscribe((event) => {
      if (event.type !== "updated") return;
      const key = event.query.queryKey;
      const connectedKey = queryKeys.connectedToolkits();
      if (JSON.stringify(key) !== JSON.stringify(connectedKey)) return;

      const data = event.query.state.data;
      if (!Array.isArray(data)) return;
      const current = new Set<string>(data as string[]);

      // First snapshot establishes baseline — no diff fires yet.
      if (previousRef.current === null) {
        previousRef.current = current;
        return;
      }

      const previous = previousRef.current;
      for (const slug of previous) {
        if (!current.has(slug)) {
          analytics.track("integration_disconnected", { integration_slug: slug });
        }
      }
      previousRef.current = current;
    });

    return () => unsubscribe();
  }, [qc]);
}
